package routes

import (
	"whatsapp/apps/api/internal/handlers"
	"whatsapp/apps/api/internal/middleware"
)

// Participants routes.
//
// This is the whole surface for participants: the handler, and every path that
// reaches it. Add a route by adding a line here. Remove the resource by
// deleting this file; nothing else refers to it.
//
// m.Public is outside the auth middleware and behind an API key, m.Protected
// takes a JWT or an API key, and m.Staff also requires the permission its
// route names (an ADMIN holds every one).
func init() {
	RegisterRoutes(func(m *Mount) {
		h := &handlers.ParticipantHandler{
			DB:      m.DB,
			AppName: m.Cfg.AppName,
		}

		m.Staff.GET("/participants", middleware.RequireRole("ADMIN", "perm:participants.view"), h.List)
		m.Staff.GET("/participants/export", middleware.RequireRole("ADMIN", "perm:participants.view"), h.Export)
		m.Staff.POST("/participants/import", middleware.RequireRole("ADMIN", "perm:participants.create"), h.Import)
		m.Staff.GET("/participants/import/template", middleware.RequireRole("ADMIN", "perm:participants.view"), h.Template)
		m.Staff.GET("/participants/:id", middleware.RequireRole("ADMIN", "perm:participants.view"), h.GetByID)
		m.Staff.GET("/participants/:id/pdf", middleware.RequireRole("ADMIN", "perm:participants.view"), h.PDF)
		m.Staff.POST("/participants", middleware.RequireRole("ADMIN", "perm:participants.create"), h.Create)
		m.Staff.PUT("/participants/:id", middleware.RequireRole("ADMIN", "perm:participants.edit"), h.Update)
		m.Staff.PATCH("/participants/:id", middleware.RequireRole("ADMIN", "perm:participants.edit"), h.Patch)

		m.Staff.DELETE("/participants/:id", middleware.RequireRole("ADMIN", "perm:participants.delete"), h.Delete)
		m.Staff.POST("/participants/bulk", middleware.RequireRole("ADMIN", "perm:participants.delete"), h.Bulk)
	})
}
