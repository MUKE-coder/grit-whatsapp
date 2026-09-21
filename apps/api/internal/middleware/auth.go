package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"whatsapp/apps/api/internal/authz"
	"whatsapp/apps/api/internal/models"
	"whatsapp/apps/api/internal/respond"
	"whatsapp/apps/api/internal/services"
)

// Auth creates a JWT authentication middleware.
func Auth(db *gorm.DB, authService *services.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Resolve the access token. The HttpOnly cookie path is the
		// recommended flow for browser clients — JS never sees the token,
		// so XSS cannot exfiltrate it. The Authorization: Bearer header
		// path is the fallback for native mobile / desktop clients that
		// can't or don't want to use cookies.
		token := ""
		if cookieValue, err := c.Cookie("grit_access"); err == nil && cookieValue != "" {
			token = cookieValue
		} else if authHeader := c.GetHeader("Authorization"); authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || parts[0] != "Bearer" {
				respond.Fail(c, respond.CodeUnauthorized, "Invalid authorization header format")
				c.Abort()
				return
			}
			token = parts[1]
		}

		if token == "" {
			respond.Fail(c, respond.CodeUnauthorized, "Authentication required")
			c.Abort()
			return
		}

		// An access token, whose session is still live: a refresh token, or a
		// token from a session that logged out, is refused here.
		claims, err := authService.ValidateAccessToken(token)
		if err != nil {
			respond.Fail(c, respond.CodeUnauthorized, "Invalid or expired token")
			c.Abort()
			return
		}

		// Load user from database.
		// Use Where("id = ?") rather than First(&user, id) — GORM's shorthand
		// emits the bare value into the WHERE clause and Postgres rejects UUID
		// primary keys with "trailing junk after numeric literal".
		var user models.User
		if err := db.WithContext(c.Request.Context()).Where("id = ?", claims.UserID).First(&user).Error; err != nil {
			respond.Fail(c, respond.CodeUnauthorized, "User not found")
			c.Abort()
			return
		}

		if !user.Active {
			respond.Fail(c, respond.CodeAccountDisabled, "Your account has been disabled")
			c.Abort()
			return
		}

		c.Set("user", user)
		c.Set("user_id", user.ID)
		c.Set("user_email", user.Email)
		c.Set("user_role", user.Role)

		// Resolve the caller's permission grants once per request so route
		// guards and handlers don't each hit the database. authz.GrantsFor is
		// cached and invalidated on role changes, so this is usually free.
		// A failure here is not fatal: the request continues with no grants and
		// role-name checks still apply, which fails closed rather than 500ing
		// every route the moment the roles table has a problem.
		if grants, err := authz.GrantsFor(db, user.ID); err == nil {
			c.Set("user_grants", grants)
		}

		c.Next()
	}
}

// RequireRole guards a route by role name, permission, or both.
//
// Each argument is either a legacy role name ("ADMIN") or a permission key
// prefixed with "perm:" ("perm:users.delete"). Access is granted if ANY
// argument matches — so the two styles can be mixed during a migration:
//
//	protected.Use(middleware.RequireRole("ADMIN", "perm:users.delete"))
//
// The signature is unchanged on purpose: every existing RequireRole("ADMIN")
// call site keeps working untouched, and permissions can be adopted route by
// route instead of in one breaking sweep.
func RequireRole(rolesOrPerms ...string) gin.HandlerFunc {
	// Split once at construction rather than per request.
	var roles, perms []string
	for _, arg := range rolesOrPerms {
		if strings.HasPrefix(arg, "perm:") {
			perms = append(perms, strings.TrimPrefix(arg, "perm:"))
			continue
		}
		roles = append(roles, arg)
	}

	return func(c *gin.Context) {
		// Permission check first — it's the model we want callers to move to.
		if len(perms) > 0 {
			if grants, ok := c.Get("user_grants"); ok {
				if list, ok := grants.([]string); ok {
					for _, p := range perms {
						if authz.Granted(list, p) {
							c.Next()
							return
						}
					}
				}
			}
		}

		// No permission matched; fall back to the legacy role names.
		if len(roles) == 0 {
			respond.Fail(c, respond.CodeForbidden, "You do not have permission to perform this action")
			c.Abort()
			return
		}

		userRole, exists := c.Get("user_role")
		if !exists {
			respond.Fail(c, respond.CodeUnauthorized, "Not authenticated")
			c.Abort()
			return
		}

		role, ok := userRole.(string)
		if !ok {
			respond.Fail(c, respond.CodeInternalError, "Invalid user role")
			c.Abort()
			return
		}

		for _, r := range roles {
			if role == r {
				c.Next()
				return
			}
		}

		respond.Fail(c, respond.CodeForbidden, "You do not have permission to access this resource")
		c.Abort()
	}
}

// RequireStaff admits anyone who can do something in the admin: the ADMIN
// role, or any permission at all. It is a gate, not a guard. Every route behind
// it names the permission it needs, and routes that name none stay in the ADMIN
// group, so one that forgets fails closed.
func RequireStaff() gin.HandlerFunc {
	return func(c *gin.Context) {
		if role, _ := c.Get("user_role"); role == models.RoleAdmin {
			c.Next()
			return
		}
		if grants, ok := c.Get("user_grants"); ok {
			if list, ok := grants.([]string); ok && len(list) > 0 {
				c.Next()
				return
			}
		}
		respond.Fail(c, respond.CodeForbidden, "You do not have permission to access this resource")
		c.Abort()
	}
}

// RequirePermissionFor guards a route whose resource is in the URL. The
// dashboard's stats and charts take it as :resource, so the permission they
// need is that resource's, which a route written once cannot name in advance.
func RequirePermissionFor(param, action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if role, _ := c.Get("user_role"); role == models.RoleAdmin {
			c.Next()
			return
		}
		if grants, ok := c.Get("user_grants"); ok {
			if list, ok := grants.([]string); ok && authz.Granted(list, c.Param(param)+"."+action) {
				c.Next()
				return
			}
		}
		respond.Fail(c, respond.CodeForbidden, "You do not have permission to access this resource")
		c.Abort()
	}
}
