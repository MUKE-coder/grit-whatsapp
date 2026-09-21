package mail

import (
	"bytes"
	"fmt"
	"html/template"
	"os"
	"sort"
	"sync"
	"time"
)

// Template is an email the admin's Mail Preview lists. Render builds the
// message with sample data, through the same code that sends the real one.
type Template struct {
	// Name is the :template in /api/admin/mail/preview/:template.
	Name        string
	Description string
	Render      func() (*Message, error)
}

var (
	registryMu sync.RWMutex
	registry   = map[string]Template{}
)

// Register adds a template to the Mail Preview. Each email grit generate mail
// writes in internal/mail/templates registers itself from an init function.
// Registering a name again replaces the first.
func Register(t Template) {
	if t.Name == "" || t.Render == nil {
		panic("mail.Register: a template needs a Name and a Render function")
	}
	registryMu.Lock()
	defer registryMu.Unlock()
	registry[t.Name] = t
}

// Templates lists the registered templates by name.
func Templates() []Template {
	registryMu.RLock()
	defer registryMu.RUnlock()
	out := make([]Template, 0, len(registry))
	for _, t := range registry {
		out = append(out, t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// LookupTemplate returns the registered template called name.
func LookupTemplate(name string) (Template, bool) {
	registryMu.RLock()
	defer registryMu.RUnlock()
	t, ok := registry[name]
	return t, ok
}

var layout = template.Must(template.New("layout").Parse(baseLayout))

// RenderLayout puts content inside the shared layout: the app name over the
// card, the year and the app name under it. content must already be safe
// HTML, which is what html/template renders. An empty appName uses APP_NAME.
func RenderLayout(appName string, content template.HTML) (string, error) {
	var buf bytes.Buffer
	err := layout.Execute(&buf, map[string]interface{}{
		"AppName": appNameOr(appName),
		"Content": content,
		"Year":    time.Now().Year(),
	})
	if err != nil {
		return "", fmt.Errorf("rendering the mail layout: %w", err)
	}
	return buf.String(), nil
}

func appNameOr(name string) string {
	if name != "" {
		return name
	}
	if env := os.Getenv("APP_NAME"); env != "" {
		return env
	}
	return "App"
}

// builtIn registers one of the templates in EmailTemplates with sample data.
func builtIn(name, description, subject string, sample func() map[string]interface{}) {
	Register(Template{
		Name:        name,
		Description: description,
		Render: func() (*Message, error) {
			data := sample()
			data["AppName"] = appNameOr("")
			data["Year"] = time.Now().Year()
			var m Mailer
			html, err := m.renderTemplate(name, data)
			if err != nil {
				return nil, err
			}
			return &Message{Subject: subject, HTML: html}, nil
		},
	})
}

func init() {
	builtIn("welcome", "Sent when a new user registers", "Welcome", func() map[string]interface{} {
		return map[string]interface{}{"Name": "Ada Lovelace", "DashboardURL": "https://example.com/dashboard"}
	})
	builtIn("password-reset", "Sent when a user asks to reset their password", "Reset your password", func() map[string]interface{} {
		return map[string]interface{}{"ResetURL": "https://example.com/reset-password?token=sample"}
	})
	builtIn("email-verification", "Sent to confirm a user's email address", "Confirm your email address", func() map[string]interface{} {
		return map[string]interface{}{"VerifyURL": "https://example.com/verify-email?token=sample"}
	})
	builtIn("notification", "A general notification with an optional button", "New activity", func() map[string]interface{} {
		return map[string]interface{}{
			"Title":      "New activity",
			"Message":    "Someone commented on your post.",
			"ActionURL":  "https://example.com/activity",
			"ActionText": "View activity",
		}
	})
}
