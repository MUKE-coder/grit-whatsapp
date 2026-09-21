package routes

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/MUKE-coder/gorm-studio/studio"
	"github.com/MUKE-coder/pulse/pulse"
	sentinel "github.com/MUKE-coder/sentinel/v2"
	"github.com/MUKE-coder/sentinel/v2/redisstore"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"whatsapp/apps/api/internal/ai"
	"whatsapp/apps/api/internal/authz"
	"whatsapp/apps/api/internal/cache"
	"whatsapp/apps/api/internal/config"
	"whatsapp/apps/api/internal/database"
	"whatsapp/apps/api/internal/events"
	"whatsapp/apps/api/internal/flags"
	"whatsapp/apps/api/internal/handlers"
	"whatsapp/apps/api/internal/jobs"
	"whatsapp/apps/api/internal/mail"
	"whatsapp/apps/api/internal/middleware"
	"whatsapp/apps/api/internal/models"
	"whatsapp/apps/api/internal/realtime"
	"whatsapp/apps/api/internal/respond"
	"whatsapp/apps/api/internal/services"
	"whatsapp/apps/api/internal/settings"
	"whatsapp/apps/api/internal/storage"
	"whatsapp/apps/api/internal/sync"
	"whatsapp/apps/api/internal/webhooks"
	// Imports added by plugins.
	// grit:imports
)

// splitOrigins parses the cors.origins setting.
//
// Newlines or commas, because the admin renders a textarea and people type
// both. Blank lines and stray whitespace are dropped rather than becoming an
// origin nothing can ever match.
func splitOrigins(raw string) []string {
	fields := strings.FieldsFunc(raw, func(r rune) bool {
		// No escapes here on purpose. unicode.IsSpace covers newline, carriage
		// return, tab and space in one call, rather than four rune literals a
		// shell heredoc can eat on the way in.
		return r == ',' || unicode.IsSpace(r)
	})
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		if f != "" {
			out = append(out, f)
		}
	}
	return out
}

// eventBusStatus summarises the domain event bus for /api/health.
//
// Nil-safe so a project whose routes.go predates events.Init still answers
// the health check rather than panicking on it.
func eventBusStatus() interface{} {
	bus := events.Default()
	if bus == nil {
		return map[string]interface{}{"ok": false, "configured": false}
	}
	s := bus.Stats()
	return map[string]interface{}{
		"ok":          s.Dropped == 0,
		"configured":  true,
		"subscribers": s.Subscribers,
		"queued":      s.Queued,
		"capacity":    s.Capacity,
		"dropped":     s.Dropped,
	}
}

// APIVersion is the version segment every /api route is served under, so the
// public surface is /api/v1/... rather than /api/....
//
// Why a prefix at all: once anything outside this repo calls your API — a
// mobile build you can't force-update, a partner integration, a customer's
// script — you can no longer change a response shape without breaking them.
// A version in the path gives you somewhere to put the new shape. When that
// day comes, add a v2 group next to v1 and leave v1 answering the old way
// until consumers have moved; delete it when your logs say nobody's left.
//
// Unversioned /api/... requests are rewritten to this version (see
// mountLegacyAPIAlias), so existing clients keep working after an upgrade.
// That alias is a courtesy for the transition, not a second API: it always
// points at whatever APIVersion currently is, so a client that never adopts
// the prefix will eventually be dragged onto a version it wasn't written for.
const APIVersion = "v1"

// authRouteLimits are the per-route limits on the routes that take a password
// or a one-time code, under the live API prefix. Development gets room to test.
func authRouteLimits(dev bool) map[string]sentinel.Limit {
	v := "/api/" + APIVersion + "/auth"
	if dev {
		relaxed := sentinel.Limit{Requests: 100, Window: time.Minute}
		return map[string]sentinel.Limit{v + "/login": relaxed, v + "/register": relaxed}
	}
	return map[string]sentinel.Limit{
		v + "/login":           {Requests: 5, Window: 15 * time.Minute},
		v + "/register":        {Requests: 3, Window: 15 * time.Minute},
		v + "/forgot-password": {Requests: 3, Window: 15 * time.Minute},
		v + "/reset-password":  {Requests: 5, Window: 15 * time.Minute},
		v + "/totp/verify":     {Requests: 5, Window: 5 * time.Minute},
	}
}

// wafExcludedRoutes lists the paths Sentinel's WAF steps aside for, under the
// live API prefix.
//
// Uploads are here because the WAF rejects any body over its inspection cap
// before the route runs, and a photograph is larger than that cap by design.
// The richtext resources are here because the XSS heuristics flag ordinary
// markup: a blog body is <p> and <strong> and <img> by definition.
//
// Exclusion is from body inspection only. These routes still pass through
// auth, RBAC, binding validation and rate limiting.
func wafExcludedRoutes() []string {
	prefix := "/api/" + APIVersion
	paths := []string{
		"/blogs", "/blogs/*",
		"/posts", "/posts/*",
		"/articles", "/articles/*",
		"/uploads", "/uploads/*",
		// Every generated resource's CSV import. A spreadsheet is over the WAF's
		// body cap, and its cells trip the injection heuristics. "*" spans the
		// one segment naming the resource.
		"/*/import",
		// Public form-share submissions. Auth is the share's bcrypt password
		// (optional) and the token itself; Sentinel rate-limits the path. The
		// subtree match also covers .../submit.
		"/public/forms/*",
	}
	out := make([]string, 0, len(paths))
	for _, p := range paths {
		out = append(out, prefix+p)
	}
	return out
}

// Services holds all Phase 4 services for dependency injection.
type Services struct {
	Cache   *cache.Cache
	Storage *storage.Storage
	Mailer  *mail.Mailer
	AI      *ai.AI
	Jobs    *jobs.Client
	// SecObsBridge talks to Sentinel + Pulse over loopback so the
	// in-app Security/Observability dashboards can show summary cards
	// without iframing. Nil when Sentinel/Pulse are both disabled.
	SecObs *services.SecObsBridge
}

// Setup wires the application, and these five are the parts of it that are
// configuration rather than wiring.
//
// Setup was 902 lines. Most of that was not the shape of the application, which
// is what you open routes.go to see: it was the Sentinel config literal, the
// Pulse options, the Studio mount and the middleware chain, in the middle of
// it. They are here now, each named for what it mounts, and Setup reads as the
// sequence it always was.
//
// What deliberately stays in Setup: the handler construction and every route
// group with a // grit: marker in it. Those markers are where plugins and
// grit generate resource inject code, and injected code refers to handlers
// Setup builds, so the marker and the variable have to share a scope.

// mountGlobalMiddleware installs the chain every request passes through.
//
// Order matters and is the reason this is one function rather than a list:
// maintenance mode answers before anything else does the work, the request id
// exists before the logger prints it, and CSRF runs after the body limits so an
// oversized body is refused before it is parsed.
// It returns the CORS origin resolver, because two things outside the chain
// read the same list: the realtime socket, which accepts a cookie handshake
// only from an origin CORS allows.
func mountGlobalMiddleware(r *gin.Engine, cfg *config.Config, svc *Services) func() []string {
	r.Use(middleware.Maintenance())
	r.Use(middleware.SecurityHeaders())
	// Body size and deadlines, per route. A route not listed gets a 10 MB body
	// and the server's timeouts; a generated resource's /export and /import are
	// transfers without being listed. List a route here when it takes an upload,
	// streams a response or waits on something slow.
	r.Use(middleware.RequestLimits(map[string]middleware.Transfer{
		"POST /api/" + APIVersion + "/uploads":              {Body: 512 << 20, Read: true, Write: true},
		"POST /api/" + APIVersion + "/ai/complete":          {Write: true},
		"POST /api/" + APIVersion + "/ai/chat":              {Write: true},
		"POST /api/" + APIVersion + "/ai/stream":            {Write: true},
		"GET /api/" + APIVersion + "/users/:id/gdpr-export": {Write: true},
		"GET /api/" + APIVersion + "/audit/ocsf":            {Write: true},
		"GET /api/" + APIVersion + "/backups/:id/download":  {Write: true},
	}))
	r.Use(middleware.RequestID())
	// The client IP, the user agent and the request id, on the request's
	// context, so a service can read them without taking a *gin.Context.
	r.Use(middleware.RequestMeta())
	r.Use(middleware.Logger())
	r.Use(gin.Recovery())
	// Origins come from the cors.origins setting when it has a value, and from
	// CORS_ORIGINS otherwise. Resolved per request, so adding a domain in the
	// admin takes effect immediately rather than at the next deploy.
	corsOrigins := func() []string {
		if stored := settings.String(context.Background(), "cors.origins"); strings.TrimSpace(stored) != "" {
			return splitOrigins(stored)
		}
		return cfg.CORSOrigins
	}
	r.Use(middleware.CORSDynamic(corsOrigins))
	r.Use(middleware.Gzip())

	// CSRF defence — only enforces on cookie-authenticated mutations.
	// Bearer (mobile/desktop) flows pass through with no header required.
	// Pairs with services.AuthService.SetAuthCookies (the HttpOnly cookie
	// path documented in /docs/backend/authentication).
	r.Use(middleware.AutoCSRF())

	// Idempotent retries for unsafe methods. Activates only when the client
	// sends an Idempotency-Key header; cached for 24h on 2xx responses.
	r.Use(middleware.Idempotency(svc.Cache))

	return corsOrigins
}

// mountSentinel mounts the security suite: WAF, rate limiting, auth shield and
// anomaly detection, with its dashboard at /sentinel.
//
// A mount failure is logged rather than fatal. Sentinel refuses to start on a
// misconfiguration, and in development that should not take the API down with
// it.
func mountSentinel(r *gin.Engine, db *gorm.DB, cfg *config.Config, svc *Services) {
	// Mount Sentinel security suite (WAF, rate limiting, auth shield, anomaly detection)
	if cfg.SentinelEnabled {
		// In development, use relaxed rate limits so devs don't get blocked while testing
		isDev := cfg.AppEnv == "development"
		ipLimit := &sentinel.Limit{Requests: 100, Window: 1 * time.Minute}
		// Built from the prefix the router mounts, because Sentinel matches the
		// request path exactly. Written as /api/auth/login these never matched
		// a request, so the login limit and AuthShield never fired.
		routeLimits := authRouteLimits(false)
		if isDev {
			ipLimit = &sentinel.Limit{Requests: 1000, Window: 1 * time.Minute}
			routeLimits = authRouteLimits(true)
		}

		// Sentinel persists its security data (threat log, blocked IPs,
		// audit trail) through its own storage adapter, NOT the *gorm.DB we
		// pass in. Left unset it silently falls back to a local sentinel.db
		// SQLite file — which is ephemeral inside a container, so every
		// redeploy would drop the threat log and the blocked-IP list. Point
		// it at the same database the app uses when that's Postgres.
		sentinelStorage := sentinel.StorageConfig{Driver: sentinel.SQLite, DSN: "sentinel.db"}
		if !strings.HasPrefix(cfg.DatabaseURL, "sqlite:") {
			sentinelStorage = sentinel.StorageConfig{Driver: sentinel.Postgres, DSN: cfg.DatabaseURL}
		}
		// Keys the audit log's hash chain: an entry edited by someone with the
		// database but not this key fails verification on the dashboard.
		sentinelStorage.AuditKey = cfg.SentinelAuditKey
		// Sentinel's storage is a second connection pool on the same server, in
		// every replica, so it is capped like the app's (database.SentinelPoolSize).
		sentinelStorage.MaxOpenConns, sentinelStorage.MaxIdleConns = database.SentinelPoolSize()

		// Rate limits and AuthShield lockouts counted in Redis, so replicas
		// share them. Counted per process, N replicas gave a client N times
		// every limit and N times the failed logins before a lockout.
		var sentinelCounters sentinel.CounterStore
		if svc.Cache != nil {
			sentinelCounters = redisstore.New(svc.Cache.Client())
		}

		// Sentinel v2 — use MountE so we can recover gracefully on
		// misconfiguration in dev instead of log.Fatalf-ing the host.
		// Mount runs sentinel.ValidateConfig and logs any dead config.
		if err := sentinel.MountE(r, db, sentinel.Config{
			Storage:  sentinelStorage,
			Counters: sentinelCounters,
			// Who made each request, for the Users page, the GDPR report and
			// anomaly detection, which sees nothing without it. Sentinel reads
			// it after the handler chain, by when the auth middleware has put
			// the caller on the context.
			UserExtractor: func(c *gin.Context) *sentinel.UserContext {
				id := c.GetString("user_id")
				if id == "" {
					return nil
				}
				return &sentinel.UserContext{ID: id, Email: c.GetString("user_email"), Role: c.GetString("user_role")}
			},
			Dashboard: sentinel.DashboardConfig{
				Username:  cfg.SentinelUsername,
				Password:  cfg.SentinelPassword,
				SecretKey: cfg.SentinelSecretKey,
				// Sentinel refuses default credentials in gin.ReleaseMode;
				// opt-in only for dev so prod can't ship forgeable JWTs.
				AllowInsecureDefaults: isDev,
			},
			WAF: sentinel.WAFConfig{
				Enabled: true,
				Mode: func() sentinel.WAFMode {
					if isDev {
						return sentinel.ModeLog
					}
					return sentinel.ModeBlock
				}(),
				// v2.0 X-Forwarded-For trust closed. Empty list = ignore
				// XFF entirely (the safe default). Operators behind a known
				// reverse proxy should populate via SENTINEL_TRUSTED_PROXIES.
				TrustedProxies: cfg.SentinelTrustedProxies,
				// 1 MB cap covers richtext admin payloads — Tiptap blog
				// bodies with embedded inline images comfortably exceed
				// the prior 64 KB ceiling. Bump higher if your content
				// embeds large base64 images.
				MaxBodyBytes:        1 * 1024 * 1024,
				RejectOversizedBody: true,
				// Authenticated admin write endpoints handle their own
				// HTML/richtext payloads via Tiptap. The WAF's XSS detection
				// otherwise flags every <p>/<strong>/<img> tag in a blog
				// body as a payload. These routes still pass through auth
				// + RBAC + binding validation; WAF is just stepped aside
				// for their bodies.
				//
				// IMPORTANT: the WAF matches these against the real request
				// path (c.Request.URL.Path), NOT gin's route template. Gin
				// params like "/api/blogs/:id" therefore match only the
				// literal string ":id" and never "/api/blogs/123" — they
				// were silent dead config. Use "/*" (a subtree match) so the
				// id/token routes are actually excluded.
				//
				// They are built from APIVersion for the same reason. Every
				// entry here was once written as a literal "/api/blogs", while
				// the router mounts "/api/" + APIVersion, so not one of them
				// ever matched. Two things were broken by that and neither
				// announced itself: an upload over MaxBodyBytes was rejected
				// with 413 before the handler saw it, and richtext bodies were
				// never actually stepped aside, so in production (ModeBlock) a
				// blog post containing markup could be refused as an XSS
				// payload. Deriving the prefix means the next version bump
				// cannot quietly disable all of it again.
				ExcludeRoutes: wafExcludedRoutes(),
			},
			RateLimit: sentinel.RateLimitConfig{
				Enabled: !isDev,
				ByIP:    ipLimit,
				ByRoute: routeLimits,
			},
			AuthShield: sentinel.AuthShieldConfig{
				Enabled:    !isDev,
				LoginRoute: "/api/" + APIVersion + "/auth/login",
				// v2.0 CAPTCHA tier sits between soft and hard thresholds.
				// Wire a provider by setting CaptchaProvider in your app code.
			},
			Anomaly: sentinel.AnomalyConfig{Enabled: !isDev},
			Geo:     sentinel.GeoConfig{Enabled: !isDev},
		}); err != nil {
			log.Printf("Warning: Sentinel mount failed: %v", err)
		} else {
			log.Println("Sentinel mounted at /sentinel")
		}
	}
}

// mountStudio mounts the database browser at /studio.
func mountStudio(r *gin.Engine, db *gorm.DB, cfg *config.Config) {
	// Mount GORM Studio
	if cfg.GORMStudioEnabled {
		studioCfg := studio.Config{
			Prefix:     "/studio",
			ReadOnly:   cfg.GORMStudioReadOnly,
			DisableSQL: cfg.GORMStudioDisableSQL,
		}
		if cfg.GORMStudioUsername != "" && cfg.GORMStudioPassword != "" {
			studioCfg.AuthMiddleware = gin.BasicAuth(gin.Accounts{
				cfg.GORMStudioUsername: cfg.GORMStudioPassword,
			})
		}
		studio.Mount(r, db, []interface{}{&models.User{}, &models.Upload{}, &models.Blog{} /* grit:studio */}, studioCfg)
		log.Println("GORM Studio mounted at /studio")
	}
}

// mountPulse mounts observability at /pulse: request tracing, database
// monitoring, runtime metrics and error tracking.
func mountPulse(r *gin.Engine, db *gorm.DB, cfg *config.Config, svc *Services) {
	// Mount Pulse observability (request tracing, DB monitoring, runtime metrics, error tracking)
	if cfg.PulseEnabled {
		// Pulse v1.0 uses functional options + a context. The context
		// drives clean shutdown of the dashboard's WebSocket + background
		// samplers; we hand it the request context so a server shutdown
		// also unwinds Pulse.
		pulseOpts := []pulse.Option{
			pulse.WithAppName(cfg.AppName),
			pulse.WithCredentials(cfg.PulseUsername, cfg.PulsePassword),
			pulse.WithExcludePaths("/studio/*", "/sentinel/*", "/docs/*", "/pulse/*"),
			pulse.WithPrometheus(),
			// CRITICAL: Pulse's error middleware captures a request-body snippet
			// (MaxBodySize, default 4096) for error context, but restores ONLY
			// that snippet to the request — it discards everything past 4096
			// bytes. That truncates EVERY request carrying a Content-Length
			// (mobile / native / curl clients; browsers dodge it by sending
			// chunked), silently breaking file uploads and any large JSON POST.
			// Disable body capture so the full body always reaches the handler.
			pulse.WithRequestBodyCaptureDisabled(),
		}
		if cfg.IsDevelopment() {
			pulseOpts = append(pulseOpts, pulse.WithDevMode())
		}
		// Pulse v1.0 SQLite-backed storage — request/query/error data
		// survives a restart. Stay on the in-memory ring buffer for peak
		// write throughput.
		if cfg.PulseStorage == "sqlite" && cfg.PulseStorageDSN != "" {
			pulseOpts = append(pulseOpts, pulse.WithSQLite(cfg.PulseStorageDSN))
		}
		p := pulse.Mount(context.Background(), r, db, pulseOpts...)

		// Register health checks for connected services
		if svc.Cache != nil {
			p.AddHealthCheck(pulse.HealthCheck{
				Name:     "redis",
				Type:     "redis",
				Critical: false,
				CheckFunc: func(ctx context.Context) error {
					return svc.Cache.Client().Ping(ctx).Err()
				},
			})
		}

		log.Println("Pulse observability mounted at /pulse")
	}
}

// mountAuthRoutes mounts everything a caller with no session yet can reach:
// the password flow, OAuth, enterprise SSO over OIDC and SAML, and the two
// second factors.
//
// Public by necessity. These are the sign-in, so there is nobody to
// authenticate yet; what makes each safe is its own protocol, a server-side
// challenge for passkeys and a short-lived pending token for TOTP.
func mountAuthRoutes(v1 *gin.RouterGroup, authHandler *handlers.AuthHandler, ssoHandler *handlers.SSOHandler, totpHandler *handlers.TOTPHandler, passkeyHandler *handlers.PasskeyHandler) {
	// Public auth routes
	auth := v1.Group("/auth")
	{
		auth.POST("/register", authHandler.Register)
		auth.POST("/login", authHandler.Login)
		auth.POST("/refresh", authHandler.Refresh)
		auth.POST("/forgot-password", authHandler.ForgotPassword)
		auth.POST("/reset-password", authHandler.ResetPassword)
		auth.POST("/verify-email", authHandler.VerifyEmail)
	}

	// OAuth2 social login
	oauth := auth.Group("/oauth")
	{
		oauth.GET("/:provider", authHandler.OAuthBegin)
		oauth.GET("/:provider/callback", authHandler.OAuthCallback)
	}

	// Enterprise SSO (OIDC). Public by design — these ARE the login flow.
	// Discover tells the login form whether an address belongs to a connection;
	// the other two are the redirect out to the IdP and the return trip.
	//
	// Like the OAuth callbacks above, /callback is registered in the customer's
	// IdP console, so its unversioned path must keep working — see the note on
	// APIVersion.
	sso := auth.Group("/sso")
	{
		sso.POST("/discover", ssoHandler.Discover)
		sso.GET("/:slug", ssoHandler.Begin)
		sso.GET("/:slug/callback", ssoHandler.Callback)
	}

	// SAML 2.0. /metadata is what the customer uploads to their IdP and /acs is
	// where that IdP POSTs the signed assertion — both get registered on their
	// side, so like the OAuth callbacks these unversioned paths must keep
	// working across API version bumps.
	samlGroup := auth.Group("/saml")
	{
		samlGroup.GET("/:slug/metadata", ssoHandler.SAMLMetadata)
		samlGroup.GET("/:slug", ssoHandler.SAMLBegin)
		samlGroup.POST("/:slug/acs", ssoHandler.SAMLACS)
	}

	// TOTP verification (public — uses pending tokens, not JWT)
	// Passkey sign-in. Public because there is no session yet; the
	// server-side challenge is what makes it safe.
	auth.POST("/passkeys/login/begin", passkeyHandler.BeginLogin)
	auth.POST("/passkeys/login/finish", passkeyHandler.FinishLogin)
	auth.POST("/totp/verify", totpHandler.Verify)
	auth.POST("/totp/backup-codes/verify", totpHandler.VerifyBackupCode)
}

// Setup configures all routes and returns the Gin engine.
func Setup(db *gorm.DB, cfg *config.Config, svc *Services) *gin.Engine {
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()

	// X-Forwarded-For, X-Real-IP and X-Forwarded-Proto are believed only from the
	// proxies TRUSTED_PROXIES names. First, so every middleware after it keys rate
	// limits, sessions and audit rows on the real client address.
	if err := middleware.TrustProxies(r, cfg.TrustedProxies); err != nil {
		log.Printf("%v", err)
	}

	// Global middleware
	corsOrigins := mountGlobalMiddleware(r, cfg, svc)

	mountSentinel(r, db, cfg, svc)

	mountStudio(r, db, cfg)

	// API Documentation (gin-docs — auto-generated from routes + models)
	//
	// The OpenAPI reference. Its 141 route overrides live in apidocs.go, where
	// they are 500 lines of description rather than 500 lines in the middle of
	// the file that wires your application together.
	// In production only with API_DOCS_PUBLIC=true: the reference maps every
	// route, admin, backup, SSO and GDPR ones included, with a console to call
	// them.
	if cfg.AppEnv != "production" || cfg.APIDocsPublic {
		registerAPIDocs(r, db, cfg)
	}

	mountPulse(r, db, cfg, svc)

	// Auth service
	authService := &services.AuthService{
		Secret:        cfg.JWTSecret,
		AccessExpiry:  cfg.JWTAccessExpiry,
		RefreshExpiry: cfg.JWTRefreshExpiry,
		// Sessions are checked on every access token, so logging out, signing out
		// everywhere and changing a password take effect at once.
		DB: db,
	}
	// The refresh cookie is scoped to the auth routes, wherever the version puts
	// them.
	services.RefreshCookiePath = "/api/" + APIVersion + "/auth"

	// Handlers
	authHandler := &handlers.AuthHandler{
		DB:          db,
		AuthService: authService,
		Config:      cfg,
		Mailer:      svc.Mailer,
		Jobs:        svc.Jobs,
	}
	apiKeyHandler := &handlers.APIKeyHandler{DB: db}

	userHandler := &handlers.UserHandler{
		DB:          db,
		AuthService: authService,
	}
	uploadHandler := &handlers.UploadHandler{
		DB:          db,
		Storage:     svc.Storage,
		Jobs:        svc.Jobs,
		AllowedMIME: handlers.UploadMIMEAllowlist(cfg.UploadAllowedMIME),
	}
	aiHandler := &handlers.AIHandler{
		AI: svc.AI,
	}
	jobsHandler := &handlers.JobsHandler{
		RedisURL: cfg.RedisURL,
	}
	cronHandler := &handlers.CronHandler{}
	blogHandler := handlers.NewBlogHandler(db)
	totpHandler := &handlers.TOTPHandler{
		DB:          db,
		AuthService: authService,
		Issuer:      cfg.TOTPIssuer,
	}
	// The passkey relying party, built once from the origins the frontends
	// actually run on. A deployment with none (CORS_ORIGINS unset or '*')
	// gets a nil service, and every passkey route answers 501 rather than
	// panicking: passkeys are optional, a broken boot is not.
	passkeys, passkeyErr := services.NewPasskeys(db, cfg.AppName, cfg.CORSOrigins)
	if passkeyErr != nil {
		log.Printf("Passkeys disabled: %v", passkeyErr)
		passkeys = nil
	}
	passkeyHandler := handlers.NewPasskeyHandler(db, passkeys, authHandler)
	activityHandler := handlers.NewActivityHandler(db)
	webhookHandler := handlers.NewWebhookHandler(db)
	webhooks.Setup(db)
	// WithRedis is a no-op when REDIS_URL is empty, so a single-process
	// project keeps the in-process hub and a multi-replica one fans out
	// across every instance without a second thing to configure. Without a
	// backplane, a user on replica A never sees an event published on
	// replica B and nothing anywhere reports it.
	// MODULE_REALTIME=false turns realtime off: no Redis subscription here and
	// no /api/ws route below. The hub is still built, empty, so code that pushes
	// to it needs no nil check, and with nobody able to connect a push reaches
	// no one.
	var realtimeOptions []realtime.Option
	if cfg.Modules.Realtime {
		realtimeOptions = append(realtimeOptions, realtime.WithRedis(cfg.RedisURL, ""))
	}
	realtimeHub := realtime.NewHub(realtimeOptions...)
	// Revoking a session has to close that user's live sockets too. Without
	// this, "sign out of all devices" leaves every open WebSocket streaming.
	services.OnSessionsRevoked = realtimeHub.DisconnectUser

	// The domain event bus. Created before any handler so an emit during
	// startup has somewhere to go, and wired to the audit log, realtime and
	// (when the plugin is installed) outbound webhooks.
	events.Init(4)
	services.RegisterEventSubscribers(db, realtimeHub, nil)
	// Durable subscribers are delivered from the outbox by this relay. Every
	// replica runs one; row claims keep two from delivering a message twice.
	events.StartRelay(db)

	// Settings: declare, then open the store. Declaring after Init would mean
	// a setting the first cache load never saw.
	settings.RegisterDefaults()
	settings.Init(db)
	settingsHandler := &handlers.SettingsHandler{DB: db}
	flagsEngine := flags.New(db, realtimeHub)
	featureFlagHandler := handlers.NewFeatureFlagHandler(db, flagsEngine)
	realtimeHandler := handlers.NewRealtimeHandler(realtimeHub, authService)
	// A browser handshake authenticates with the grit_access cookie, which a
	// page on any site can make the browser send, so it is accepted only from
	// the origins CORS allows.
	realtime.AllowedOrigins = corsOrigins

	// In-app Security + Observability dashboards — read from Sentinel/Pulse APIs
	// over loopback. notificationHandler powers the admin bell.
	notificationHandler := &handlers.NotificationHandler{DB: db}
	securityHandler := &handlers.SecurityHandler{Bridge: svc.SecObs}
	observabilityHandler := &handlers.ObservabilityHandler{Bridge: svc.SecObs}

	// v3.30 — semantic activity log + ticket system. Mailer is optional;
	// when nil the ticket handler skips email-out and only writes the row
	// + admin notifications.
	userActivityHandler := &handlers.UserActivityHandler{DB: db}
	ocsfHandler := handlers.NewOCSFHandler(db, cfg.AppName)
	accessReviewHandler := handlers.NewAccessReviewHandler(db)
	gdprHandler := handlers.NewGDPRHandler(db)
	ticketHandler := &handlers.TicketHandler{DB: db, Mail: svc.Mailer, Jobs: svc.Jobs}
	// v3.31.20 — public form sharing (Phase 2)
	formShareHandler := &handlers.FormShareHandler{DB: db}
	// v3.31.40 — per-user dashboard customisation
	dashboardLayoutHandler := &handlers.DashboardLayoutHandler{DB: db}
	// v3.31.44 — per-resource dashboard stats (Total + sparkline + Latest N)
	resourceStatsHandler := &handlers.ResourceStatsHandler{DB: db}
	// v3.31.47 — Preset Chart builder
	chartHandler := &handlers.ChartHandler{DB: db}

	// Sync registry — list every model that should be syncable from
	// offline-first desktop clients. The resource generator injects
	// new resources at the marker below.
	syncRegistry := sync.NewRegistry()
	// Never users or uploads. A push is a generic write: a user row carries its
	// own role and email, an upload row the key of any object in the bucket.
	// Both have their own APIs with their own checks, and syncing them let any
	// account make itself ADMIN.
	syncRegistry.Register("blogs", &models.Blog{})
	// grit:sync
	syncHandler := handlers.NewSyncHandler(db, syncRegistry)
	// v3.31.68 — shared background CSV import status endpoint
	importJobHandler := &handlers.ImportJobHandler{DB: db}
	// v3.31.77 — full-database backups (weekly cron + manual + download)
	backupHandler := &handlers.BackupHandler{DB: db, Storage: svc.Storage}
	roleHandler := handlers.NewRoleHandler(db)
	// Permission caches are per process. Share makes a role change on one
	// replica reach every other within a second.
	authz.Share(db)
	sessionHandler := handlers.NewSessionHandler(db)

	// Enterprise SSO. Providers are built once here (each one performs OIDC
	// discovery against the customer's IdP) and rebuilt whenever an admin saves
	// a connection, so adding a customer never needs a restart. A connection
	// whose discovery fails is logged and skipped — one broken IdP must not
	// stop everyone else signing in.
	ssoRegistry := services.NewSSORegistry(cfg.AppURL)
	for _, err := range ssoRegistry.Reload(db) {
		log.Printf("sso: %v", err)
	}
	samlRegistry := services.NewSAMLRegistry(cfg.AppURL)
	for _, err := range samlRegistry.Reload(db) {
		log.Printf("saml: %v", err)
	}
	ssoHandler := handlers.NewSSOHandler(db, authService, cfg, ssoRegistry, samlRegistry)
	// Rebuild the SSO registries when another replica changes a connection.
	services.WatchSSO(db, ssoRegistry, samlRegistry)
	// grit:handlers

	// Files kept by STORAGE_DRIVER=local. Keys under storage.PublicPrefixes are
	// served to anyone, every other key only through a signed temporary URL. A
	// bucket serves its own files, so nothing is mounted for one.
	if svc.Storage != nil {
		if fileServer := svc.Storage.FileServer(); fileServer != nil {
			r.GET(storage.LocalFilesRoute, gin.WrapH(fileServer))
			r.HEAD(storage.LocalFilesRoute, gin.WrapH(fileServer))
		}
	}

	// Queue counts for /api/health, read by a background refresh at most every
	// 30 seconds, so a probe never waits on Redis for them.
	var queueStats *jobs.StatsCache
	if svc.Jobs != nil {
		qs, err := jobs.NewStatsCache(cfg.RedisURL, 30*time.Second)
		if err != nil {
			log.Printf("Queue counts on /api/health are off: %v", err)
		}
		queueStats = qs
	}

	// Health check
	// /api/health probes every infrastructure dependency the dashboard's
	// System Health page wants to render. Each probe is bounded by a 500ms
	// timeout so a hung dependency doesn't pile up health requests; failing
	// probes mark themselves down and the overall status downgrades to
	// "degraded" rather than failing the endpoint.
	// Registered at two paths, not one. The frontends' axios client rewrites
	// /api/... to /api/v1/..., so the admin's System Health page asked for
	// /api/v1/health, no route matched, and the unversioned fallback refused to
	// rewrite a path that already names the version: the page read "degraded"
	// with a 404 behind it. /api/health stays for probes, load balancers and the
	// desktop client's heartbeat, which are configured outside this repo.
	healthCheck := func(c *gin.Context) {
		type compStatus struct {
			OK         bool   `json:"ok"`
			LatencyMS  int64  `json:"latency_ms,omitempty"`
			Tables     int    `json:"tables,omitempty"`
			Queued     *int   `json:"queued,omitempty"`
			Active     *int   `json:"active,omitempty"`
			Configured bool   `json:"configured,omitempty"`
			Driver     string `json:"driver,omitempty"`
			Error      string `json:"error,omitempty"`
		}

		// Database ping + table count. We probe with a 500ms deadline so a
		// blocked write loop can't hang the health check.
		dbStatus := compStatus{OK: true}
		dbStart := time.Now()
		if sqlDB, err := db.DB(); err == nil {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 500*time.Millisecond)
			defer cancel()
			if err := sqlDB.PingContext(ctx); err != nil {
				dbStatus.OK = false
				log.Printf("health: database ping failed: %v", err)
			}
		}
		dbStatus.LatencyMS = time.Since(dbStart).Milliseconds()
		if dbStatus.OK {
			// Best-effort table count. Dialect-aware, and 0 rather than an
			// error when the database cannot be asked: a missing tooltip
			// figure is not a health problem.
			dbStatus.Tables = database.TableCount(db)
		}

		// Redis ping. Reuse the same cache client the rest of the app uses
		// rather than opening a new connection — that way "Redis healthy"
		// on the dashboard means the same Redis the cache + jobs use.
		redisStatus := compStatus{}
		if svc.Cache != nil {
			redisStart := time.Now()
			ctx, cancel := context.WithTimeout(c.Request.Context(), 500*time.Millisecond)
			defer cancel()
			if err := svc.Cache.Client().Ping(ctx).Err(); err != nil {
				redisStatus.OK = false
				log.Printf("health: redis ping failed: %v", err)
			} else {
				redisStatus.OK = true
			}
			redisStatus.LatencyMS = time.Since(redisStart).Milliseconds()
		}

		// Background jobs: up when Redis is, with queue counts from a snapshot
		// refreshed in the background. Counting asynq's keys here ran KEYS inside
		// Redis on every probe, stalling every Redis client while it ran. If asynq
		// isn't wired (Jobs == nil), report unconfigured rather than "down" so the
		// dashboard distinguishes the cases.
		jobsStatus := compStatus{}
		if svc.Jobs != nil && svc.Cache != nil {
			jobsStatus.OK = redisStatus.OK
			if stats, ok := queueStats.Snapshot(); ok {
				jobsStatus.Queued, jobsStatus.Active = &stats.Queued, &stats.Active
			}
		}

		// Email is reported by the driver main.go picked: smtp, resend, log and
		// so on. No mailer is "not configured", which the dashboard shows as a
		// dash rather than as down.
		mailStatus := compStatus{Configured: svc.Mailer != nil, OK: svc.Mailer != nil}
		if svc.Mailer != nil {
			mailStatus.Driver = svc.Mailer.Driver()
		}

		// Overall status — ok if every wired-up component is up. Components
		// that aren't configured (e.g. Redis off in a single-binary dev
		// run) don't drag the overall status down.
		overall := "ok"
		if !dbStatus.OK || (svc.Cache != nil && !redisStatus.OK) {
			overall = "degraded"
		}

		c.JSON(http.StatusOK, gin.H{
			"status":   overall,
			"version":  "0.1.0",
			"database": dbStatus,
			"redis":    redisStatus,
			"api":      compStatus{OK: true},
			"jobs":     jobsStatus,
			"email":    mailStatus,
			// The event bus reports itself. Dropped rising is the only signal
			// from outside that a subscriber is too slow or the queue too
			// small, and "did my webhook fire" deserves a better answer than
			// reading logs.
			"events": eventBusStatus(),

			// This replica's sockets, and what its hub delivered, dropped and
			// failed to publish to the others.
			"realtime": realtimeHub.Stats(),
		})
	}
	r.GET("/api/health", healthCheck)
	r.GET("/api/"+APIVersion+"/health", healthCheck)

	// WebSocket: realtime hub. Browsers authenticate with the grit_access
	// cookie from an allowed origin, native clients with ?token=<jwt> or an
	// Authorization header. Not mounted when MODULE_REALTIME=false, so the
	// path answers 404.
	if cfg.Modules.Realtime {
		r.GET("/api/ws", realtimeHandler.Connect)
	}

	// Public webhook receiver — no auth on the route itself; each
	// provider's signature verification is the real auth boundary.
	// POST /webhooks/:provider routes to whatever was registered via
	// webhooks.Register(...) at app boot.
	r.POST("/webhooks/:provider", webhookHandler.Receive)

	// ── API version ──────────────────────────────────────────────────────
	// Every /api route hangs off this group, so the whole surface is served
	// under /api/v1. When a breaking change is unavoidable, add a v2 group
	// beside it and keep v1 serving the old shape until consumers migrate —
	// that's the entire point of the prefix.
	//
	// Unversioned /api/... requests are rewritten to the current version by
	// the fallback at the bottom of this file, so older clients (and the
	// generated frontends) keep working untouched.
	v1 := r.Group("/api/" + APIVersion)

	// Public blog routes (no auth required)
	blogs := v1.Group("/blogs")
	{
		blogs.GET("", blogHandler.ListPublished)
		blogs.GET("/:slug", blogHandler.GetBySlug)
	}

	// Public API surface, for clients with no logged-in user: a storefront, a
	// mobile app, a public directory.
	//
	// Guarded by an API key rather than open. That is not secrecy, because a
	// publishable key ships inside your app where anyone can read it. It buys
	// identification, a rate-limit bucket per key, per-endpoint and per-origin
	// narrowing, and the ability to turn one client off without a deploy.
	//
	// Resources land here through: grit generate resource <Name> --public
	publicAPI := v1.Group("/public")
	publicAPI.Use(middleware.RequireAPIKey(db, svc.Cache))
	// Response caching, and only here.
	//
	// The cache key is the URL, nothing else. On a public endpoint that is
	// exactly right: every caller gets the same answer, so one cached copy
	// serves all of them and a catalogue page stops hitting Postgres on every
	// visit. On a protected endpoint the same key would serve one user's data
	// to another, which is why this middleware is mounted on this group and
	// nowhere else.
	//
	// The TTL is read once at boot rather than per request. A cache lifetime is
	// not something anybody changes at 9pm, and re-reading it on the hot path
	// of a cached response would cost more than it saves.
	if svc.Cache != nil {
		ttl := time.Duration(settings.Int(context.Background(), "cache.public_ttl_seconds")) * time.Second
		if ttl <= 0 {
			ttl = 60 * time.Second
		}
		publicAPI.Use(middleware.CacheResponse(svc.Cache, ttl))
		log.Printf("Public endpoints cached for %s", ttl)
	}
	{
		// grit:routes:public
	}

	mountAuthRoutes(v1, authHandler, ssoHandler, totpHandler, passkeyHandler)

	// Protected routes
	protected := v1.Group("")
	// Accepts an API key OR the usual JWT. With no key header present this
	// delegates straight to middleware.Auth, so browser sessions behave
	// exactly as before; with one, it sets the same context values so every
	// downstream handler and RequireRole check works unchanged.
	protected.Use(middleware.APIKeyOrAuth(db, middleware.Auth(db, authService)))
	// Activity logger writes one row per successful authenticated mutation.
	// Records who/what/when/where for audit. Read-only — see admin/activity.
	protected.Use(middleware.ActivityLogger(db))
	// Request middleware added by plugins. It runs after auth, so anything
	// here can read the authenticated user.
	// grit:middleware:protected
	{
		protected.GET("/auth/me", authHandler.Me)
		// The caller's own permissions, for the frontend can() helper and nav
		// gating. Any authenticated user may read their own — it tells them
		// nothing they can't already discover by clicking.
		protected.GET("/auth/permissions", roleHandler.MyPermissions)

		// Which optional modules are enabled. The admin reads this to hide nav
		// entries for modules that are switched off — a dead link to a route
		// that no longer exists is worse than no link.
		protected.GET("/system/modules", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"data": cfg.Modules.Map()})
		})
		protected.POST("/auth/logout", authHandler.Logout)

		// Active sessions — see every signed-in device and revoke one or all.
		protected.GET("/auth/sessions", sessionHandler.List)
		protected.DELETE("/auth/sessions/:id", sessionHandler.Revoke)
		protected.POST("/auth/sessions/revoke-all", sessionHandler.RevokeAll)

		// Two-Factor Authentication (TOTP)
		protected.POST("/auth/totp/setup", totpHandler.Setup)
		protected.POST("/auth/totp/enable", totpHandler.Enable)
		protected.POST("/auth/totp/disable", totpHandler.Disable)
		protected.GET("/auth/totp/status", totpHandler.Status)
		protected.POST("/auth/totp/backup-codes", totpHandler.RegenerateBackupCodes)
		protected.DELETE("/auth/totp/trusted-devices", totpHandler.RevokeTrustedDevices)
		protected.POST("/auth/verify-email/send", authHandler.SendVerificationEmail)

		// Recovery contacts. Every write takes the account password, because a
		// recovery address is a second way in and a live session is exactly what
		// somebody on a borrowed laptop already has.
		recoveryHandler := handlers.NewRecoveryHandler(db, svc.Mailer)
		// Passkeys. Registration is behind auth because you add one to an
		// account you are already in; the sign-in pair is public by necessity.
		protected.GET("/auth/passkeys", passkeyHandler.List)
		protected.POST("/auth/passkeys/register/begin", passkeyHandler.BeginRegistration)
		protected.POST("/auth/passkeys/register/finish", passkeyHandler.FinishRegistration)
		protected.PATCH("/auth/passkeys/:id", passkeyHandler.Rename)
		protected.DELETE("/auth/passkeys/:id", passkeyHandler.Delete)
		protected.GET("/auth/security", recoveryHandler.Overview)
		protected.POST("/auth/recovery/email", recoveryHandler.SetEmail)
		protected.POST("/auth/recovery/email/verify", recoveryHandler.VerifyEmail)
		protected.DELETE("/auth/recovery/email", recoveryHandler.ClearEmail)
		protected.POST("/auth/recovery/phone", recoveryHandler.SetPhone)
		protected.POST("/auth/recovery/phone/verify", recoveryHandler.VerifyPhone)
		protected.DELETE("/auth/recovery/phone", recoveryHandler.ClearPhone)
		protected.GET("/api-keys", apiKeyHandler.List)
		protected.POST("/api-keys", apiKeyHandler.Create)
		protected.DELETE("/api-keys/:id", apiKeyHandler.Revoke)
		protected.GET("/auth/totp/trusted-devices", totpHandler.ListTrustedDevices)
		protected.DELETE("/auth/totp/trusted-devices/:id", totpHandler.RevokeTrustedDevice)

		// User routes (authenticated)

		// GDPR right-to-access: a user may export their own data; an admin, anyone's.
		protected.GET("/users/:id/gdpr-export", gdprHandler.Export)

		// File uploads
		protected.POST("/uploads", uploadHandler.Create)
		// The client optimises before it uploads, so it needs the same numbers
		// the server would have used.
		protected.GET("/media/profiles", uploadHandler.Profiles)
		protected.POST("/uploads/presign", uploadHandler.Presign)
		protected.POST("/uploads/complete", uploadHandler.CompleteUpload)
		protected.GET("/uploads", uploadHandler.List)
		protected.GET("/uploads/stats", uploadHandler.Stats)
		protected.GET("/uploads/:id", uploadHandler.GetByID)
		// The file itself, through the API: private files too, on any driver.
		protected.GET("/uploads/:id/download", uploadHandler.Download)
		protected.DELETE("/uploads/:id", uploadHandler.Delete)

		// Offline-first sync — desktop clients call these to flush their
		// local outbox and pull server-side updates.
		protected.POST("/sync/push", syncHandler.Push)
		protected.GET("/sync/pull", syncHandler.Pull)
		protected.GET("/sync/policy", syncHandler.Policy)

		// Reading settings is open to any authenticated caller, because a
		// screen needs app.name to render its header. Writing is admin-only
		// and mounted with the other admin routes below.
		protected.GET("/settings", settingsHandler.List)

		// AI — only mounted when the module is enabled, so an app that
		// doesn't use it exposes no AI surface at all (MODULE_AI=false).
		if cfg.Modules.AI {
			protected.POST("/ai/complete", aiHandler.Complete)
			protected.POST("/ai/chat", aiHandler.Chat)
			protected.POST("/ai/stream", aiHandler.Stream)
		}

		// In-app notification bell — every authenticated user. Pulls
		// from a single Notification table that the SecObs poller
		// writes into when Sentinel/Pulse fires a high-severity event.
		protected.GET("/notifications", notificationHandler.List)
		protected.POST("/notifications/:id/read", notificationHandler.MarkRead)
		protected.POST("/notifications/read-all", notificationHandler.MarkAllRead)

		// v3.31.40 — per-user dashboard layout customisation.
		protected.GET("/dashboard-layout", dashboardLayoutHandler.Get)
		protected.PUT("/dashboard-layout", dashboardLayoutHandler.Put)

		// v3.30 — tickets. Any authenticated user can open + reply; the
		// handler scopes List/Get visibility to the caller unless they're
		// ADMIN/EDITOR (then they see the full queue).
		protected.POST("/tickets", ticketHandler.Create)
		protected.GET("/tickets", ticketHandler.List)
		protected.GET("/tickets/:id", ticketHandler.Get)
		protected.POST("/tickets/:id/reply", ticketHandler.Reply)
		protected.PATCH("/tickets/:id/close", ticketHandler.Close)
		protected.PATCH("/tickets/:id/reopen", ticketHandler.Reopen)
		protected.PATCH("/tickets/:id/assign", ticketHandler.Assign) // admin-gated inside the handler

		// v3.31.68 — poll a background CSV import's progress/result.
		protected.GET("/imports/:id", importJobHandler.GetByID)

		// grit:routes:protected
	}

	// Profile routes (any authenticated user)
	profile := protected.Group("/profile")
	{
		profile.GET("", userHandler.GetProfile)
		profile.PUT("", userHandler.UpdateProfile)
		profile.DELETE("", userHandler.DeleteProfile)
	}

	// Staff routes: anyone who holds a permission reaches this group, and each
	// route names the one it needs. Before v3.220.0 all of these sat behind the
	// ADMIN role, so a custom role granted users.view was refused by every admin
	// endpoint. The admin group below stays ADMIN-only, so a route that names no
	// permission, a plugin's included, fails closed there.
	staff := v1.Group("")
	staff.Use(middleware.APIKeyOrAuth(db, middleware.Auth(db, authService)))
	// Plugin middleware for the staff group, between authentication and the gate.
	//
	// This group carries every DELETE and every bulk route, so a plugin that
	// scopes queries has to run here: with the multitenant plugin mounted on the
	// protected group alone, deleting a tenant-owned row answered 500 because no
	// organization was ever resolved.
	//
	// Before the gate, not after, because a plugin can decide what the caller may
	// do: a role held through an organization membership has to be in hand before
	// RequireStaff reads the grants, or the answer is 403 for somebody who is
	// staff of the organization they are acting in.
	// grit:middleware:staff
	staff.Use(middleware.RequireStaff())
	{
		staff.GET("/users", middleware.RequireRole("ADMIN", "perm:users.view"), userHandler.List)
		// Reading a user takes the same grant as listing them. Your own record is
		// GET /profile.
		staff.GET("/users/:id", middleware.RequireRole("ADMIN", "perm:users.view"), userHandler.GetByID)
		staff.POST("/users", middleware.RequireRole("ADMIN", "perm:users.create"), userHandler.Create)
		staff.PUT("/users/:id", middleware.RequireRole("ADMIN", "perm:users.edit"), userHandler.Update)
		staff.DELETE("/users/:id", middleware.RequireRole("ADMIN", "perm:users.delete"), userHandler.Delete)
		staff.PUT("/users/:id/roles", middleware.RequireRole("ADMIN", "perm:users.edit"), roleHandler.AssignUserRoles)
		staff.POST("/users/:id/unlock", middleware.RequireRole("ADMIN", "perm:users.edit"), userHandler.Unlock)

		// GDPR right-to-erasure: anonymize a user and hard-delete their PII, with
		// the erasure recorded in a tamper-evident deletion journal.
		staff.POST("/users/:id/gdpr-erase", middleware.RequireRole("ADMIN", "perm:users.delete"), gdprHandler.Erase)
		staff.GET("/gdpr/journal", middleware.RequireRole("ADMIN", "perm:audit.view"), gdprHandler.Journal)

		// Activity: the tamper-evident log and its verification, the semantic
		// activity feed, and its OCSF export for SIEMs. Resealing is admin-only.
		staff.GET("/admin/activity", middleware.RequireRole("ADMIN", "perm:audit.view"), activityHandler.List)
		staff.GET("/admin/activity/integrity", middleware.RequireRole("ADMIN", "perm:audit.view"), activityHandler.VerifyIntegrity)
		staff.GET("/user-activity", middleware.RequireRole("ADMIN", "perm:audit.view"), userActivityHandler.List)
		staff.GET("/user-activity/stats", middleware.RequireRole("ADMIN", "perm:audit.view"), userActivityHandler.Stats)
		staff.GET("/audit/ocsf", middleware.RequireRole("ADMIN", "perm:audit.view"), ocsfHandler.Export)

		// Roles, the permission catalog, and access reviews over the grants.
		staff.GET("/permissions", middleware.RequireRole("ADMIN", "perm:roles.view"), roleHandler.Catalog)
		staff.GET("/roles", middleware.RequireRole("ADMIN", "perm:roles.view"), roleHandler.List)
		staff.POST("/roles", middleware.RequireRole("ADMIN", "perm:roles.create"), roleHandler.Create)
		staff.GET("/roles/:id", middleware.RequireRole("ADMIN", "perm:roles.view"), roleHandler.Get)
		staff.PUT("/roles/:id", middleware.RequireRole("ADMIN", "perm:roles.edit"), roleHandler.Update)
		staff.DELETE("/roles/:id", middleware.RequireRole("ADMIN", "perm:roles.delete"), roleHandler.Delete)
		staff.GET("/access-reviews", middleware.RequireRole("ADMIN", "perm:roles.view"), accessReviewHandler.List)
		staff.POST("/access-reviews", middleware.RequireRole("ADMIN", "perm:roles.edit"), accessReviewHandler.Open)
		staff.GET("/access-reviews/:id", middleware.RequireRole("ADMIN", "perm:roles.view"), accessReviewHandler.Get)
		staff.POST("/access-reviews/:id/items/:itemId/decision", middleware.RequireRole("ADMIN", "perm:roles.edit"), accessReviewHandler.Decide)
		staff.POST("/access-reviews/:id/complete", middleware.RequireRole("ADMIN", "perm:roles.edit"), accessReviewHandler.Complete)

		// Operations: jobs and the schedule, and the dashboards over Sentinel,
		// Pulse, webhooks and feature flags. Changing any of those is admin-only.
		staff.GET("/admin/jobs/stats", middleware.RequireRole("ADMIN", "perm:jobs.view"), jobsHandler.Stats)
		staff.GET("/admin/jobs/:status", middleware.RequireRole("ADMIN", "perm:jobs.view"), jobsHandler.ListByStatus)
		staff.POST("/admin/jobs/:id/retry", middleware.RequireRole("ADMIN", "perm:jobs.edit"), jobsHandler.Retry)
		staff.DELETE("/admin/jobs/queue/:queue", middleware.RequireRole("ADMIN", "perm:jobs.edit"), jobsHandler.ClearQueue)
		staff.GET("/admin/cron/tasks", middleware.RequireRole("ADMIN", "perm:jobs.view"), cronHandler.ListTasks)
		// Mail Preview: the registered email templates, rendered with sample
		// data by the code that sends them.
		mailPreview := &handlers.MailPreviewHandler{Mailer: svc.Mailer}
		staff.GET("/admin/mail/templates", middleware.RequireRole("ADMIN", "perm:system.view"), mailPreview.Templates)
		staff.GET("/admin/mail/preview/:template", middleware.RequireRole("ADMIN", "perm:system.view"), mailPreview.Preview)
		staff.GET("/admin/security/summary", middleware.RequireRole("ADMIN", "perm:system.view"), securityHandler.Summary)
		staff.GET("/admin/observability/summary", middleware.RequireRole("ADMIN", "perm:system.view"), observabilityHandler.Summary)
		staff.GET("/admin/webhooks", middleware.RequireRole("ADMIN", "perm:system.view"), webhookHandler.List)
		staff.GET("/admin/flags", middleware.RequireRole("ADMIN", "perm:system.view"), featureFlagHandler.List)
		staff.GET("/admin/flags/:id/exposures", middleware.RequireRole("ADMIN", "perm:system.view"), featureFlagHandler.Exposures)

		// Blog management.
		staff.GET("/admin/blogs", middleware.RequireRole("ADMIN", "perm:blogs.view"), blogHandler.List)
		staff.GET("/admin/blogs/:id", middleware.RequireRole("ADMIN", "perm:blogs.view"), blogHandler.GetByID)
		staff.POST("/admin/blogs", middleware.RequireRole("ADMIN", "perm:blogs.create"), blogHandler.Create)
		staff.PUT("/admin/blogs/:id", middleware.RequireRole("ADMIN", "perm:blogs.edit"), blogHandler.Update)
		staff.DELETE("/admin/blogs/:id", middleware.RequireRole("ADMIN", "perm:blogs.delete"), blogHandler.Delete)

		// Per-resource dashboard stats and charts. The resource is in the URL, so
		// the permission is that resource's view. Only resources registered in
		// the stats and chart dispatchers are reachable at all.
		staff.GET("/admin/dashboard/resource-stats/:resource", middleware.RequirePermissionFor("resource", "view"), resourceStatsHandler.Get)
		staff.GET("/admin/dashboard/chart/:resource", middleware.RequirePermissionFor("resource", "view"), chartHandler.Get)

		// Full-database backups: a weekly cron writes them, and an operator can
		// take one on demand (once a day) and download it through a short-lived
		// pre-signed URL. The settings live at their own path so they do not
		// collide with the /backups/:id wildcard.
		staff.GET("/backups", middleware.RequireRole("ADMIN", "perm:backups.view"), backupHandler.List)
		staff.POST("/backups/generate", middleware.RequireRole("ADMIN", "perm:backups.create"), backupHandler.Generate)
		staff.GET("/backups/:id/download", middleware.RequireRole("ADMIN", "perm:backups.view"), backupHandler.Download)
		staff.GET("/backup-settings", middleware.RequireRole("ADMIN", "perm:backups.view"), backupHandler.GetSettings)
		staff.PUT("/backup-settings", middleware.RequireRole("ADMIN", "perm:backups.edit"), backupHandler.UpdateSettings)
	}

	// Admin routes: the ADMIN role and nothing less. Anything that should be
	// grantable to a custom role belongs in the staff group above, naming its
	// permission.
	admin := v1.Group("")
	admin.Use(middleware.APIKeyOrAuth(db, middleware.Auth(db, authService)))
	// Plugin middleware for the admin group, for the same reasons and in the same
	// order as the staff one.
	// grit:middleware:admin
	admin.Use(middleware.RequireRole("ADMIN"))
	{
		admin.POST("/admin/activity/reseal", activityHandler.Reseal)
		admin.POST("/admin/webhooks/:id/replay", webhookHandler.Replay)
		admin.POST("/admin/flags", featureFlagHandler.Create)
		admin.PUT("/admin/flags/:id", featureFlagHandler.Update)
		admin.DELETE("/admin/flags/:id", featureFlagHandler.Delete)

		// SSO connections. Client secrets are write-only: they go in on create
		// and update and are never returned, so a compromised admin session
		// cannot read a customer's IdP credentials back out.
		admin.GET("/sso/connections", ssoHandler.List)
		admin.POST("/sso/connections", ssoHandler.Create)
		admin.PUT("/sso/connections/:id", ssoHandler.Update)
		admin.DELETE("/sso/connections/:id", ssoHandler.Delete)
		admin.GET("/sso/connections/:id/test", ssoHandler.Test)

		// Public form sharing, its field preview, and the log of submissions.
		admin.GET("/admin/form-shares", formShareHandler.List)
		admin.POST("/admin/form-shares", formShareHandler.Create)
		admin.PATCH("/admin/form-shares/:id", formShareHandler.Update)
		admin.DELETE("/admin/form-shares/:id", formShareHandler.Delete)
		admin.GET("/admin/form-shares/resources", formShareHandler.Resources)
		admin.GET("/admin/form-shares/resources/:resource/fields", formShareHandler.FieldsPreview)
		admin.GET("/admin/form-submissions", formShareHandler.ListSubmissions)

		// Writing settings. Per-setting permissions are checked inside the
		// handler, because which permission applies depends on which setting
		// is being changed and a route can only know one.
		admin.PUT("/settings", settingsHandler.Update)
		admin.DELETE("/settings/:key", settingsHandler.Reset)

		// grit:routes:admin
	}

	// Public form-sharing endpoints. NO auth, NO CSRF — Sentinel rate
	// limits each token aggressively. The dispatch service is the
	// security boundary (whitelists which resources are reachable).
	publicForms := v1.Group("/public/forms")
	{
		publicForms.GET("/:token", formShareHandler.PublicGet)
		publicForms.POST("/:token/submit", formShareHandler.PublicSubmit)
	}

	// Custom role-restricted routes
	// grit:routes:custom

	// Every generated resource, each from its own <resource>_routes.go.
	//
	// A resource file registers itself from an init(), so this loop is the
	// only place routes.go mentions them. Adding a resource does not edit this
	// file, and neither does removing one.
	mountResources(&Mount{
		Engine:    r,
		DB:        db,
		Cfg:       cfg,
		Svc:       svc,
		Hub:       realtimeHub,
		Auth:      authService,
		V1:        v1,
		Public:    publicAPI,
		Protected: protected,
		Admin:     admin,
		Staff:     staff,
	})

	mountLegacyAPIAlias(r)

	return r
}

// mountLegacyAPIAlias keeps unversioned /api/... paths working by re-dispatching
// them to /api/<APIVersion>/... .
//
// It runs as the 404 fallback rather than as middleware because Gin resolves the
// route before middleware executes — by the time a handler could rewrite the
// path, the routing decision is already made. Landing here means no route
// matched, so the only cost is on requests that were going to 404 anyway.
//
// /api/ws is deliberately excluded: a WebSocket upgrade re-dispatched through
// HandleContext does not survive reliably, and a transport endpoint isn't part
// of the REST surface being versioned.
func mountLegacyAPIAlias(r *gin.Engine) {
	versioned := "/api/" + APIVersion + "/"

	r.NoRoute(func(c *gin.Context) {
		p := c.Request.URL.Path

		if strings.HasPrefix(p, "/api/") &&
			!strings.HasPrefix(p, versioned) &&
			p != "/api/ws" {
			c.Request.URL.Path = "/api/" + APIVersion + strings.TrimPrefix(p, "/api")
			// Tell the caller they're on a deprecated path. Harmless to
			// ignore, but it shows up in their logs before v2 forces the issue.
			c.Header("Deprecation", "true")
			c.Header("Link", "</api/"+APIVersion+">; rel=\"successor-version\"")
			r.HandleContext(c)
			return
		}

		respond.Fail(c, respond.CodeNotFound, "no route matches "+c.Request.Method+" "+p)
	})
}
