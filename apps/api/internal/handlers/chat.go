package handlers

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"

	"whatsapp/apps/api/internal/respond"
	"whatsapp/apps/api/internal/services"
)

// ChatHandler exposes the messaging API under /api/v1/chat. Every route is for
// the signed-in user; the service scopes each one to their conversations.
type ChatHandler struct {
	Chat *services.ChatService
}

// chatError answers a service error: a conversation the caller cannot see is a
// 404, whatever the reason.
func chatError(c *gin.Context, err error) {
	if errors.Is(err, services.ErrNoSuchConversation) {
		respond.NotFound(c, "Conversation not found")
		return
	}
	respond.WriteError(c, err, "Something went wrong with the chat")
}

// Users lists people to start a chat with. GET /chat/users?search=
func (h *ChatHandler) Users(c *gin.Context) {
	users, err := h.Chat.Users(c.GetString("user_id"), c.Query("search"), 50)
	if err != nil {
		chatError(c, err)
		return
	}
	respond.OK(c, users)
}

// Conversations is the inbox. GET /chat/conversations
func (h *ChatHandler) Conversations(c *gin.Context) {
	list, err := h.Chat.Conversations(c.GetString("user_id"))
	if err != nil {
		chatError(c, err)
		return
	}
	respond.OK(c, list)
}

// Conversation is one inbox row. GET /chat/conversations/:id
func (h *ChatHandler) Conversation(c *gin.Context) {
	view, err := h.Chat.Conversation(c.Param("id"), c.GetString("user_id"))
	if err != nil {
		chatError(c, err)
		return
	}
	respond.OK(c, view)
}

type directRequest struct {
	UserID string `json:"user_id" binding:"required"`
}

// Direct finds or starts a one-to-one chat. POST /chat/conversations/direct
func (h *ChatHandler) Direct(c *gin.Context) {
	var req directRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respond.BadRequest(c, "Say who to message: user_id")
		return
	}
	view, err := h.Chat.Direct(c.GetString("user_id"), req.UserID)
	if err != nil {
		chatError(c, err)
		return
	}
	respond.OK(c, view)
}

type groupRequest struct {
	Title     string   `json:"title" binding:"required"`
	MemberIDs []string `json:"member_ids" binding:"required"`
}

// Group creates a group. POST /chat/conversations/group
func (h *ChatHandler) Group(c *gin.Context) {
	var req groupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respond.BadRequest(c, "A group needs a title and member_ids")
		return
	}
	view, err := h.Chat.Group(c.GetString("user_id"), req.Title, req.MemberIDs)
	if err != nil {
		chatError(c, err)
		return
	}
	respond.Created(c, view, "Group created")
}

// Messages pages backwards. GET /chat/conversations/:id/messages?before=&limit=
func (h *ChatHandler) Messages(c *gin.Context) {
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if err != nil {
		respond.BadRequest(c, "limit must be a number")
		return
	}
	list, err := h.Chat.Messages(c.Param("id"), c.GetString("user_id"), c.Query("before"), limit)
	if err != nil {
		chatError(c, err)
		return
	}
	respond.OK(c, list)
}

// Send posts a message. POST /chat/conversations/:id/messages
func (h *ChatHandler) Send(c *gin.Context) {
	var in services.SendInput
	if err := c.ShouldBindJSON(&in); err != nil {
		respond.BadRequest(c, "A message needs a body or an attachment")
		return
	}
	msg, err := h.Chat.Send(c.Param("id"), c.GetString("user_id"), in)
	if err != nil {
		chatError(c, err)
		return
	}
	respond.Created(c, msg)
}

// Delivered marks everything received. POST /chat/conversations/:id/delivered
func (h *ChatHandler) Delivered(c *gin.Context) {
	h.mark(c, false)
}

// Read marks everything read. POST /chat/conversations/:id/read
func (h *ChatHandler) Read(c *gin.Context) {
	h.mark(c, true)
}

func (h *ChatHandler) mark(c *gin.Context, read bool) {
	receipt, err := h.Chat.Mark(c.Param("id"), c.GetString("user_id"), read)
	if err != nil {
		chatError(c, err)
		return
	}
	respond.OK(c, receipt)
}

type muteRequest struct {
	Muted bool `json:"muted"`
}

// Mute turns a conversation's notifications off or on. PUT /chat/conversations/:id/mute
func (h *ChatHandler) Mute(c *gin.Context) {
	var req muteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respond.BadRequest(c, "Send {\"muted\": true} or false")
		return
	}
	if err := h.Chat.SetMuted(c.Param("id"), c.GetString("user_id"), req.Muted); err != nil {
		chatError(c, err)
		return
	}
	respond.OK(c, gin.H{"muted": req.Muted})
}
