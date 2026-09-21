package routes

import (
	"whatsapp/apps/api/internal/handlers"
	"whatsapp/apps/api/internal/middleware"
)

// Conversations routes.
//
// This is the whole surface for conversations: the handler, and every path that
// reaches it. Add a route by adding a line here. Remove the resource by
// deleting this file; nothing else refers to it.
//
// m.Public is outside the auth middleware and behind an API key, m.Protected
// takes a JWT or an API key, and m.Staff also requires the permission its
// route names (an ADMIN holds every one).
func init() {
	RegisterRoutes(func(m *Mount) {
		h := &handlers.ConversationHandler{
			DB:      m.DB,
			AppName: m.Cfg.AppName,
		}

		m.Staff.GET("/conversations", middleware.RequireRole("ADMIN", "perm:conversations.view"), h.List)
		m.Staff.GET("/conversations/export", middleware.RequireRole("ADMIN", "perm:conversations.view"), h.Export)
		m.Staff.POST("/conversations/import", middleware.RequireRole("ADMIN", "perm:conversations.create"), h.Import)
		m.Staff.GET("/conversations/import/template", middleware.RequireRole("ADMIN", "perm:conversations.view"), h.Template)
		m.Staff.GET("/conversations/:id", middleware.RequireRole("ADMIN", "perm:conversations.view"), h.GetByID)
		m.Staff.GET("/conversations/:id/pdf", middleware.RequireRole("ADMIN", "perm:conversations.view"), h.PDF)
		m.Staff.POST("/conversations", middleware.RequireRole("ADMIN", "perm:conversations.create"), h.Create)
		m.Staff.PUT("/conversations/:id", middleware.RequireRole("ADMIN", "perm:conversations.edit"), h.Update)
		m.Staff.PATCH("/conversations/:id", middleware.RequireRole("ADMIN", "perm:conversations.edit"), h.Patch)

		m.Staff.DELETE("/conversations/:id", middleware.RequireRole("ADMIN", "perm:conversations.delete"), h.Delete)
		m.Staff.POST("/conversations/bulk", middleware.RequireRole("ADMIN", "perm:conversations.delete"), h.Bulk)
	})
}
