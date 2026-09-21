package routes

import (
	"whatsapp/apps/api/internal/handlers"
	"whatsapp/apps/api/internal/middleware"
)

// Messages routes.
//
// This is the whole surface for messages: the handler, and every path that
// reaches it. Add a route by adding a line here. Remove the resource by
// deleting this file; nothing else refers to it.
//
// m.Public is outside the auth middleware and behind an API key, m.Protected
// takes a JWT or an API key, and m.Staff also requires the permission its
// route names (an ADMIN holds every one).
func init() {
	RegisterRoutes(func(m *Mount) {
		h := &handlers.MessageHandler{
			DB:      m.DB,
			AppName: m.Cfg.AppName,
			Storage: m.Svc.Storage,
		}

		m.Staff.GET("/messages", middleware.RequireRole("ADMIN", "perm:messages.view"), h.List)
		m.Staff.GET("/messages/export", middleware.RequireRole("ADMIN", "perm:messages.view"), h.Export)
		m.Staff.POST("/messages/import", middleware.RequireRole("ADMIN", "perm:messages.create"), h.Import)
		m.Staff.GET("/messages/import/template", middleware.RequireRole("ADMIN", "perm:messages.view"), h.Template)
		m.Staff.GET("/messages/:id", middleware.RequireRole("ADMIN", "perm:messages.view"), h.GetByID)
		m.Staff.GET("/messages/:id/pdf", middleware.RequireRole("ADMIN", "perm:messages.view"), h.PDF)
		m.Staff.POST("/messages", middleware.RequireRole("ADMIN", "perm:messages.create"), h.Create)
		m.Staff.PUT("/messages/:id", middleware.RequireRole("ADMIN", "perm:messages.edit"), h.Update)
		m.Staff.PATCH("/messages/:id", middleware.RequireRole("ADMIN", "perm:messages.edit"), h.Patch)

		m.Staff.DELETE("/messages/:id", middleware.RequireRole("ADMIN", "perm:messages.delete"), h.Delete)
		m.Staff.POST("/messages/bulk", middleware.RequireRole("ADMIN", "perm:messages.delete"), h.Bulk)
	})
}
