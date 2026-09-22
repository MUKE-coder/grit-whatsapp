package handlers

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"whatsapp/apps/api/internal/authz"
	"whatsapp/apps/api/internal/files"
	"whatsapp/apps/api/internal/jobs"
	"whatsapp/apps/api/internal/media"
	"whatsapp/apps/api/internal/models"
	"whatsapp/apps/api/internal/respond"
	"whatsapp/apps/api/internal/storage"
)

// defaultAllowedMIME is the upload allowlist every project starts from. A field
// with accepts narrows it; UPLOAD_ALLOWED_MIME adds to it, through
// UploadMIMEAllowlist. Nothing writes to this map after startup.
var defaultAllowedMIME = map[string]bool{
	"image/jpeg":      true,
	"image/png":       true,
	"image/gif":       true,
	"image/webp":      true,
	"video/mp4":       true,
	"video/webm":      true,
	"video/quicktime": true,
	// Audio, mirroring the "audio" accept group in the admin's file-accepts
	// lib. Without these a field declared accepts:"audio" offers an audio
	// picker and then fails the upload against this fallback, which is the
	// same trap the archive types above were added to close. Browsers record
	// as "audio/webm;codecs=opus"; parameters are stripped before the lookup,
	// so the bare type is what has to be listed.
	"audio/webm":       true,
	"audio/ogg":        true,
	"audio/mpeg":       true,
	"audio/mp4":        true,
	"audio/aac":        true,
	"audio/wav":        true,
	"audio/x-wav":      true,
	"audio/x-m4a":      true,
	"application/pdf":  true,
	"text/plain":       true,
	"text/csv":         true,
	"application/json": true,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":       true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
	// Legacy Office, still what "doc"/"excel" resolve to for older files.
	"application/msword":       true,
	"application/vnd.ms-excel": true,
	// Archives. The accept-aliases "zip" and "archive" have always resolved to
	// these; leaving them out of the fallback made those fields impossible to
	// upload through the admin, which presigns before it knows the field.
	"application/zip":              true,
	"application/x-zip-compressed": true,
	"application/gzip":             true,
	"application/x-tar":            true,
	"application/x-rar-compressed": true,
	"application/x-7z-compressed":  true,
}

// UploadMIMEAllowlist is the allowlist an UploadHandler checks: the baseline
// above plus extra, which is config.UploadAllowedMIME, from UPLOAD_ALLOWED_MIME
// (comma separated):
//
//	UPLOAD_ALLOWED_MIME=audio/flac,image/avif,model/gltf+json
//
// It extends rather than replaces, because the list above is a safety baseline
// and the request people actually have is for one more type, not for a smaller
// set. Narrow a particular field with its accepts instead.
//
// It exists so a type nobody anticipated does not require editing framework
// code inside a scaffolded project, which is an edit the manifest guard may
// hold back the next time you upgrade. It is built once, at startup, into a new
// map: the environment is read by config.Load, not when this package loads.
func UploadMIMEAllowlist(extra []string) map[string]bool {
	allowed := make(map[string]bool, len(defaultAllowedMIME)+len(extra))
	for m := range defaultAllowedMIME {
		allowed[m] = true
	}
	for _, m := range extra {
		if m = strings.ToLower(strings.TrimSpace(m)); m != "" {
			allowed[m] = true
		}
	}
	return allowed
}

// mimeAllowed reports whether the allowlist takes contentType. A handler built
// without AllowedMIME checks the baseline.
func (h *UploadHandler) mimeAllowed(contentType string) bool {
	if h.AllowedMIME == nil {
		return defaultAllowedMIME[contentType]
	}
	return h.AllowedMIME[contentType]
}

// uploadScope is the uploads a caller may see or change.
//
// A holder of uploads.<action>, or ADMIN, reaches every upload; anybody else
// reaches only their own. Before this, GET and DELETE /uploads/:id handed the
// path segment to GORM as a raw SQL condition (First with a string argument is
// a WHERE clause, not a primary key), and List and Stats covered every user's
// files.
func (h *UploadHandler) uploadScope(c *gin.Context, action string) *gorm.DB {
	q := h.DB.WithContext(c.Request.Context()).Model(&models.Upload{})
	if role, _ := c.Get("user_role"); role == "ADMIN" {
		return q
	}
	if grants, ok := c.Get("user_grants"); ok {
		if list, ok := grants.([]string); ok && authz.Granted(list, "uploads."+action) {
			return q
		}
	}
	return q.Where("user_id = ?", c.GetString("user_id"))
}

// MaxUploadSize is the maximum file size (50 MB).
const MaxUploadSize = 50 << 20

// UploadHandler handles file upload endpoints.
type UploadHandler struct {
	DB      *gorm.DB
	Storage *storage.Storage
	Jobs    *jobs.Client
	// AllowedMIME is the allowlist for an upload whose field sent no accepts.
	// routes.go builds it with UploadMIMEAllowlist(cfg.UploadAllowedMIME).
	AllowedMIME map[string]bool
}

// Create handles file upload via multipart form.
//
// Query params (v3.31.30):
//
//	accepts   — comma-separated list of CLI accept aliases
//	            (image, video, pdf, doc, excel, csv, zip, archive, all).
//	            When present, validates the upload's MIME against the
//	            alias set. Absent = fall back to the global allowlist.
//	max_size  — per-field byte cap. Overrides MaxUploadSize when set
//	            (e.g. video fields raise it to 300MB).
//
// Response: a files.FileRef directly under data so the frontend can
// store it verbatim in form state, no shape massaging needed.
func (h *UploadHandler) Create(c *gin.Context) {
	if h.Storage == nil {
		respond.Fail(c, respond.CodeStorageUnavailable, "File storage is not configured")
		return
	}

	// Read before the body is. The route is behind the auth middleware, and a
	// handler that assumed so, rather than checking, panicked on every request
	// the day it was mounted anywhere else.
	userID := authz.CurrentUserID(c)
	if userID == "" {
		respond.Fail(c, respond.CodeUnauthorized, "Not signed in")
		return
	}

	// Cap the request body before multipart parsing so a malicious huge upload
	// isn't fully spooled to temp disk before the per-field size check rejects
	// it. 512MB comfortably clears the largest legitimate accept (video).
	const absoluteMaxUpload = 512 << 20
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, absoluteMaxUpload)

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		// Fall back to the first file part under ANY field name — some clients
		// name the field differently. ParseMultipartForm is cheap once gin has
		// already touched the body.
		if perr := c.Request.ParseMultipartForm(32 << 20); perr == nil && c.Request.MultipartForm != nil {
			for _, fhs := range c.Request.MultipartForm.File {
				if len(fhs) > 0 {
					if f, oerr := fhs[0].Open(); oerr == nil {
						file, header, err = f, fhs[0], nil
					}
					break
				}
			}
		}
	}
	if err != nil || file == nil {
		// Log what actually arrived so a client-side multipart problem — e.g. a
		// manually-set Content-Type that drops the boundary, or an empty body
		// from a broken native uploader — is diagnosable from the server log.
		fields := []string{}
		if c.Request.MultipartForm != nil {
			for k := range c.Request.MultipartForm.File {
				fields = append(fields, k)
			}
		}
		log.Printf("[uploads] no file part: content-type=%q file-fields=%v content-length=%d",
			c.ContentType(), fields, c.Request.ContentLength)
		respond.Fail(c, respond.CodeInvalidFile, "No file provided")
		return
	}
	defer file.Close()

	// Per-field accept list. Comma-separated aliases.
	var acceptsList []string
	if a := c.Query("accepts"); a != "" {
		for _, s := range strings.Split(a, ",") {
			s = strings.TrimSpace(s)
			if s != "" {
				acceptsList = append(acceptsList, s)
			}
		}
	}

	// Per-field max size override. Bytes.
	maxSize := int64(MaxUploadSize)
	if m := c.Query("max_size"); m != "" {
		if parsed, perr := strconv.ParseInt(m, 10, 64); perr == nil && parsed > 0 {
			maxSize = parsed
		}
	} else if len(acceptsList) > 0 {
		// No explicit max_size, but field type is known — use the
		// default-for-accepts (5MB for most, 300MB for video).
		maxSize = files.DefaultMaxSizeBytes(acceptsList)
	}

	if header.Size > maxSize {
		respond.Fail(c, respond.CodeFileTooLarge, fmt.Sprintf("File size exceeds maximum of %d MB", maxSize/(1<<20)))
		return
	}

	// The declared Content-Type is trivially spoofed, so the real type is sniffed
	// from the bytes and reconciled with it: HTML and SVG are refused whatever
	// they claim, and a claimed image must be one.
	mimeType, err := storage.DetectContentType(file, header.Header.Get("Content-Type"))
	switch {
	case errors.Is(err, storage.ErrContentMismatch):
		respond.Fail(c, respond.CodeInvalidFileType, "File content does not match its declared type")
		return
	case errors.Is(err, storage.ErrFileTypeNotAllowed):
		respond.Fail(c, respond.CodeInvalidFileType, "File type not allowed")
		return
	case err != nil:
		respond.Fail(c, respond.CodeUploadFailed, "Could not read the uploaded file")
		return
	}

	// If accepts was provided, validate against the per-field allow set.
	// Otherwise fall back to the global allowlist (backwards-compat).
	allowed := func(contentType string) bool {
		if len(acceptsList) > 0 {
			return files.AllowsMIME(acceptsList, contentType)
		}
		return h.mimeAllowed(contentType)
	}
	if !allowed(mimeType) {
		respond.Fail(c, respond.CodeInvalidFileType, "File type not allowed")
		return
	}

	// Every key is generated, <yyyy>/<mm>/<uuid><ext>: the name the file
	// arrived with is kept on the row and never reaches storage.
	var key string
	disk := h.Storage.Disk()

	// The optimisation profile this field asked for. An unknown or absent name
	// resolves to the default profile rather than failing, so a stale name in a
	// client build degrades to sensible behaviour instead of a broken upload.
	profileName := c.Query("profile")
	profile := media.Get(profileName)

	storedMIME := mimeType
	storedSize := header.Size
	ref := files.FileRef{
		Name:    header.Filename,
		Profile: profileName,
	}

	// Optimise before storing, not after.
	//
	// The version this replaces uploaded the original, queued a job, and
	// returned a ref whose ThumbnailURL was still empty because the worker had
	// not run yet. That ref is what got written into the record, so every
	// thumbnail Grit generated for a resource field was orphaned: produced,
	// paid for, and referenced by nothing. Doing the primary transform inline
	// means the row is only ever written with final URLs, and the 5 MB original
	// never lands in the public prefix at all.
	optimised := false
	if media.IsOptimisable(mimeType) {
		res, terr := media.Transform(file, profile)
		if terr != nil {
			// A file nobody can decode is not necessarily a lost cause: the
			// profile decides whether to refuse it or keep it as it came.
			if profile.OnError == media.Reject {
				respond.Fail(c, respond.CodeInvalidFileType, "That image could not be processed")
				return
			}
			log.Printf("media: keeping %s unoptimised: %v", header.Filename, terr)
		} else {
			optimised = true
			key = storage.NewKey("uploads", res.Primary.Ext)
			stem := strings.TrimSuffix(key, res.Primary.Ext)

			// The original, under a prefix of its own. Private, because it is
			// kept for reprocessing rather than for serving, and a 5 MB file
			// reachable by anyone who guesses the key defeats the exercise.
			if !profile.DiscardOriginal {
				if _, serr := file.Seek(0, io.SeekStart); serr == nil {
					origKey := "originals/" + strings.TrimPrefix(stem, "uploads/") + storage.Extension(header.Filename, mimeType)
					if err := disk.Put(c.Request.Context(), origKey, file, storage.PutOptions{ContentType: mimeType, Visibility: storage.VisibilityPrivate}); err == nil {
						ref.OriginalKey = origKey
						ref.OriginalSize = header.Size
					} else {
						// Not fatal. Losing the ability to reprocess later is
						// worth less than the upload the user is waiting on.
						log.Printf("media: could not keep the original for %s: %v", header.Filename, err)
					}
				}
			}

			storedMIME = res.Primary.MIME
			storedSize = int64(len(res.Primary.Bytes))
			if err := disk.Put(c.Request.Context(), key, bytes.NewReader(res.Primary.Bytes), storage.PutOptions{ContentType: storedMIME}); err != nil {
				respond.Fail(c, respond.CodeUploadFailed, "Failed to upload file")
				return
			}

			w, hgt := res.Primary.Width, res.Primary.Height
			ref.Width, ref.Height = &w, &hgt
			ref.Format = strings.TrimPrefix(res.Primary.MIME, "image/")

			// Renditions upload side by side, four at a time. One after another,
			// an image with several sizes kept the request waiting on each.
			var (
				renditionsMu sync.Mutex
				renditionsWG sync.WaitGroup
				uploadSlots  = make(chan struct{}, 4)
			)
			for _, r := range res.Extra {
				renditionsWG.Add(1)
				uploadSlots <- struct{}{}
				go func() {
					defer func() {
						<-uploadSlots
						renditionsWG.Done()
					}()
					rk := stem + "-" + r.Name + r.Ext
					if err := disk.Put(c.Request.Context(), rk, bytes.NewReader(r.Bytes), storage.PutOptions{ContentType: r.MIME}); err != nil {
						// A missing rendition is a smaller problem than a failed
						// upload: the primary is already stored and usable.
						log.Printf("media: rendition %q failed for %s: %v", r.Name, header.Filename, err)
						return
					}
					renditionsMu.Lock()
					defer renditionsMu.Unlock()
					if ref.Renditions == nil {
						ref.Renditions = map[string]files.Rendition{}
					}
					ref.Renditions[r.Name] = files.Rendition{
						URL: h.Storage.GetURL(rk), Key: rk,
						Width: r.Width, Height: r.Height,
						Size: int64(len(r.Bytes)), MIME: r.MIME,
					}
					// The thumb doubles as the ref's thumbnail, which is what the
					// admin table and the dropzone preview read.
					if r.Name == "thumb" {
						ref.ThumbnailURL = h.Storage.GetURL(rk)
					}
				}()
			}
			renditionsWG.Wait()

			log.Printf("media[%s]: %s %.1fKB %dx%d -> %.1fKB %s %dx%d",
				media.Backend(), header.Filename, float64(header.Size)/1024,
				res.OriginalWidth, res.OriginalHeight,
				float64(storedSize)/1024, ref.Format, w, hgt)
		}
	}

	// Not optimisable, or optimisation was declined: store what arrived.
	if !optimised {
		stored, err := storage.Store(c.Request.Context(), disk, "uploads", header, storage.StoreOptions{MaxSize: maxSize, Allow: allowed})
		if err != nil {
			log.Printf("[uploads] storing %s: %v", header.Filename, err)
			respond.Fail(c, respond.CodeUploadFailed, "Failed to upload file")
			return
		}
		key = stored
	}
	ref.Optimised = optimised

	upload := models.Upload{
		Filename:     filepath.Base(key),
		OriginalName: header.Filename,
		// The stored file, not the file that arrived. Recording the source
		// type and size here would make every storage total in the admin a
		// report of bytes the bucket does not hold.
		MimeType:     storedMIME,
		Size:         storedSize,
		Path:         key,
		URL:          h.Storage.GetURL(key),
		ThumbnailURL: ref.ThumbnailURL,
		UserID:       userID,
	}

	if err := h.DB.WithContext(c.Request.Context()).Create(&upload).Error; err != nil {
		_ = h.Storage.Delete(c.Request.Context(), key)
		respond.Fail(c, respond.CodeInternalError, "Failed to save upload record")
		return
	}

	// Only images the pipeline declined reach the worker now. Anything it
	// handled already has its renditions, and enqueueing here would generate a
	// second thumbnail that nothing reads.
	if h.Jobs != nil && !optimised && storage.IsImageMimeType(storedMIME) {
		_ = h.Jobs.EnqueueProcessImage(c.Request.Context(), upload.ID, key, storedMIME, jobs.EnqueueOption{
			IdempotencyKey: "image:process:" + upload.ID,
		})
	}

	// Filled in above by the pipeline; everything the caller needs is here, so
	// there is nothing to re-fetch later.
	ref.URL = upload.URL
	ref.Key = upload.Path
	ref.MIME = upload.MimeType
	ref.Size = upload.Size

	c.JSON(http.StatusCreated, gin.H{
		"data":    ref,
		"message": "File uploaded successfully",
	})
}

// Stats returns aggregate storage usage across the uploads table.
// Surfaces total count, total bytes, and a per-kind breakdown
// (image / video / audio / document / other) so the storage admin
// page can show usage at a glance. v3.31.32.
func (h *UploadHandler) Stats(c *gin.Context) {
	type kindRow struct {
		Kind  string `gorm:"column:kind" json:"kind"`
		Count int64  `gorm:"column:count" json:"count"`
		Size  int64  `gorm:"column:size" json:"size"`
	}

	var total int64
	if err := h.uploadScope(c, "view").Count(&total).Error; err != nil {
		respond.Fail(c, respond.CodeInternalError, "Failed to compute stats")
		return
	}

	var totalSize int64
	h.uploadScope(c, "view").Select("COALESCE(SUM(size), 0)").Scan(&totalSize)

	// Bucket by MIME kind. SUBSTR + CASE in raw SQL keeps this a single
	// scan regardless of DB engine (works on Postgres + SQLite).
	rows := []kindRow{}
	bucketExpr := `CASE
		WHEN mime_type LIKE 'image/%' THEN 'image'
		WHEN mime_type LIKE 'video/%' THEN 'video'
		WHEN mime_type LIKE 'audio/%' THEN 'audio'
		WHEN mime_type = 'application/pdf' THEN 'pdf'
		WHEN mime_type LIKE '%spreadsheet%' OR mime_type LIKE '%excel%' OR mime_type = 'text/csv' THEN 'spreadsheet'
		WHEN mime_type LIKE '%wordprocessing%' OR mime_type = 'application/msword' THEN 'document'
		ELSE 'other'
	END`
	h.uploadScope(c, "view").
		Select(bucketExpr + " AS kind, COUNT(*) AS count, COALESCE(SUM(size), 0) AS size").
		Group("kind").
		Scan(&rows)

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"total_count": total,
			"total_size":  totalSize,
			"by_kind":     rows,
		},
	})
}

// List returns a paginated list of uploads.
func (h *UploadHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := h.uploadScope(c, "view")

	// Filter by MIME type
	if mimeType := c.Query("mime_type"); mimeType != "" {
		query = query.Where("mime_type LIKE ?", mimeType+"%")
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		respond.Fail(c, respond.CodeInternalError, "Failed to count uploads")
		return
	}

	var uploads []models.Upload
	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&uploads).Error; err != nil {
		respond.Fail(c, respond.CodeInternalError, "Failed to fetch uploads")
		return
	}

	pages := int(math.Ceil(float64(total) / float64(pageSize)))

	c.JSON(http.StatusOK, gin.H{
		"data": uploads,
		"meta": gin.H{
			"total":     total,
			"page":      page,
			"page_size": pageSize,
			"pages":     pages,
		},
	})
}

// GetByID returns a single upload by ID.
func (h *UploadHandler) GetByID(c *gin.Context) {
	id := c.Param("id")

	var upload models.Upload
	if err := h.uploadScope(c, "view").Where("id = ?", id).First(&upload).Error; err != nil {
		respond.Fail(c, respond.CodeNotFound, "Upload not found")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": upload,
	})
}

// Download streams one stored file through the API under the name it was
// uploaded with, as an attachment, or inline with ?inline=true.
//
// The caller must be able to see the upload, and the bytes never need a public
// URL, so this serves private files on every driver, R2 and B2 included, where
// the bucket rather than the key decides what is public. Range requests work,
// so a video seeks and a large download resumes.
func (h *UploadHandler) Download(c *gin.Context) {
	if h.Storage == nil {
		respond.Fail(c, respond.CodeStorageUnavailable, "File storage is not configured")
		return
	}
	var upload models.Upload
	if err := h.uploadScope(c, "view").Where("id = ?", c.Param("id")).First(&upload).Error; err != nil {
		respond.Fail(c, respond.CodeNotFound, "Upload not found")
		return
	}
	disposition := storage.Attachment
	if c.Query("inline") == "true" {
		disposition = storage.Inline
	}
	storage.ServeFileAs(c, h.Storage.Disk(), upload.Path, disposition, upload.OriginalName)
}

// Delete removes an upload and its stored file.
func (h *UploadHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	var upload models.Upload
	if err := h.uploadScope(c, "delete").Where("id = ?", id).First(&upload).Error; err != nil {
		respond.Fail(c, respond.CodeNotFound, "Upload not found")
		return
	}

	// Delete from storage
	if h.Storage != nil {
		_ = h.Storage.Delete(c.Request.Context(), upload.Path)
		// Also delete thumbnail if it exists
		if upload.ThumbnailURL != "" {
			thumbKey := strings.Replace(upload.Path, "uploads/", "thumbnails/", 1)
			_ = h.Storage.Delete(c.Request.Context(), thumbKey)
		}
	}

	if err := h.DB.WithContext(c.Request.Context()).Delete(&upload).Error; err != nil {
		respond.Fail(c, respond.CodeInternalError, "Failed to delete upload")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Upload deleted successfully",
	})
}

// What the browser intends to upload.
type PresignRequest struct {
	Filename    string   `json:"filename" binding:"required"`
	ContentType string   `json:"content_type" binding:"required"`
	FileSize    int64    `json:"file_size" binding:"required"`
	Accepts     []string `json:"accepts"`
}

// Presign generates a presigned PUT URL for direct browser-to-storage upload.

func (h *UploadHandler) Presign(c *gin.Context) {
	if h.Storage == nil {
		respond.Fail(c, respond.CodeStorageUnavailable, "File storage is not configured")
		return
	}

	var req PresignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	// Mirror the multipart path: when the caller names the field's accept
	// aliases, honour them; otherwise fall back to the global allow-list.
	allowed := h.mimeAllowed(req.ContentType)
	if len(req.Accepts) > 0 {
		allowed = files.AllowsMIME(req.Accepts, req.ContentType)
	}
	if !allowed {
		respond.Fail(c, respond.CodeInvalidFileType, "File type not allowed")
		return
	}

	if req.FileSize > MaxUploadSize {
		respond.Fail(c, respond.CodeFileTooLarge, fmt.Sprintf("File size exceeds maximum of %d MB", MaxUploadSize/(1<<20)))
		return
	}

	ext := filepath.Ext(req.Filename)
	filename := fmt.Sprintf("%d-%s%s", time.Now().UnixNano(), strings.TrimSuffix(filepath.Base(req.Filename), ext), ext)
	// Every presigned key sits under the caller's own prefix, and CompleteUpload
	// records nothing else. That is what stops a user filing a row for an object
	// that is not theirs, and then deleting the object through that row.
	userID := c.GetString("user_id")
	if userID == "" {
		respond.Fail(c, respond.CodeUnauthorized, "Sign in to upload")
		return
	}
	key := fmt.Sprintf("uploads/%s/%s/%s", userID, time.Now().Format("2006/01"), filename)

	presignedURL, err := h.Storage.PresignPutURL(c.Request.Context(), key, req.ContentType, req.FileSize)
	if errors.Is(err, storage.ErrPresignUnsupported) {
		// This driver takes uploads through the API (STORAGE_DRIVER=local), so
		// the client sends the file to POST /uploads as a multipart form.
		c.JSON(http.StatusOK, gin.H{
			"data":    gin.H{"method": "multipart"},
			"message": "Send the file to POST /uploads",
		})
		return
	}
	if err != nil {
		respond.Fail(c, respond.CodePresignFailed, "Failed to generate upload URL")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"presigned_url": presignedURL,
			"key":           key,
			"public_url":    h.Storage.GetURL(key),
		},
	})
}

// Profiles publishes the image optimisation profiles.
//
// The client optimises before uploading, because a presigned PUT goes straight
// to storage and never passes through here. Serving the profiles keeps one set
// of numbers: without this the browser would carry its own copy of every size
// and quality, and the two would drift the first time one changed.
func (h *UploadHandler) Profiles(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"profiles": media.AllPublic(),
			// What the server would do with a file that reaches it, so a client
			// can tell whether it is expected to do the work itself.
			"backend":    media.Backend(),
			"max_upload": MaxUploadSize,
			"lossy_webp": media.SupportsLossyWebP(),
		},
	})
}

// A file that was PUT straight to storage.
type CompleteUploadRequest struct {
	Key         string   `json:"key" binding:"required"`
	Filename    string   `json:"filename" binding:"required"`
	ContentType string   `json:"content_type" binding:"required"`
	Size        int64    `json:"size" binding:"required"`
	Accepts     []string `json:"accepts"`
}

// CompleteUpload records a file that was uploaded directly to storage via presigned URL.

func (h *UploadHandler) CompleteUpload(c *gin.Context) {
	var req CompleteUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respond.Fail(c, respond.CodeValidationError, err.Error())
		return
	}

	// The presign gated the PUT; this call decides what gets recorded. Check
	// the type again so a client cannot presign a PDF and then file the row as
	// something else.
	allowed := h.mimeAllowed(req.ContentType)
	if len(req.Accepts) > 0 {
		allowed = files.AllowsMIME(req.Accepts, req.ContentType)
	}
	if !allowed {
		respond.Fail(c, respond.CodeInvalidFileType, "File type not allowed")
		return
	}

	// Only a key this server presigned for this user. Presign puts every key
	// under uploads/<user_id>/ and nothing else writes there, so a key outside
	// it is another user's file, a backup, or a guess. It used to be recorded
	// for whoever asked, and deleting that row deleted the object. Checked
	// before the bucket is asked, so the answer says nothing about whether a
	// key exists.
	userID := c.GetString("user_id")
	if userID == "" || !strings.HasPrefix(req.Key, "uploads/"+userID+"/") || strings.Contains(req.Key, "..") {
		respond.Fail(c, respond.CodeUploadKeyForbidden, "That upload was not issued to you")
		return
	}
	// Once per key. A second row for the same object would let one delete remove
	// a file another row still points at.
	var recorded int64
	if err := h.DB.WithContext(c.Request.Context()).Model(&models.Upload{}).Where("path = ?", req.Key).Count(&recorded).Error; err != nil {
		respond.Fail(c, respond.CodeInternalError, "Failed to check the upload")
		return
	}
	if recorded > 0 {
		respond.Fail(c, respond.CodeUploadAlreadyRecorded, "That upload has already been recorded")
		return
	}

	// Ask the bucket what it actually received.
	//
	// The bytes never came through this server, so every number in the request
	// is a claim. Believing req.Size means a client can upload anything and
	// report two kilobytes, which makes every storage total in the admin
	// fiction and removes the only size ceiling there is. The signed
	// Content-Length already makes a mismatch hard; this makes it pointless.
	storedSize, storedType, err := h.Storage.Stat(c.Request.Context(), req.Key)
	if err != nil {
		respond.Fail(c, respond.CodeUploadNotFound, "No file was uploaded to that key")
		return
	}
	if storedSize > MaxUploadSize {
		// It got past the presign somehow. Do not keep it.
		_ = h.Storage.Delete(c.Request.Context(), req.Key)
		respond.Fail(c, respond.CodeFileTooLarge, fmt.Sprintf("File size exceeds maximum of %d MB", MaxUploadSize/(1<<20)))
		return
	}
	// The stored type is what S3 recorded from the signed presign, so prefer it
	// over the one repeated in this request.
	if storedType != "" {
		req.ContentType = storedType
	}

	upload := models.Upload{
		Filename:     filepath.Base(req.Key),
		OriginalName: req.Filename,
		MimeType:     req.ContentType,
		Size:         storedSize,
		Path:         req.Key,
		URL:          h.Storage.GetURL(req.Key),
		UserID:       userID,
	}

	if err := h.DB.WithContext(c.Request.Context()).Create(&upload).Error; err != nil {
		respond.Fail(c, respond.CodeInternalError, "Failed to save upload record")
		return
	}

	// Enqueue image processing job if it's an image.
	// IdempotencyKey = upload.ID so a client retry of the same upload
	// (rare but possible after a network drop) doesn't re-process.
	if h.Jobs != nil && storage.IsImageMimeType(req.ContentType) {
		_ = h.Jobs.EnqueueProcessImage(c.Request.Context(), upload.ID, req.Key, req.ContentType, jobs.EnqueueOption{
			IdempotencyKey: "image:process:" + upload.ID,
		})
	}

	c.JSON(http.StatusCreated, gin.H{
		"data":    upload,
		"message": "Upload recorded successfully",
	})
}
