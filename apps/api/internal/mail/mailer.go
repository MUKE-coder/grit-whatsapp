package mail

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"html/template"
)

// Mailer sends email through a Transport. FromConfig picks the transport once
// from configuration, so the code that sends mail does not change when the
// provider does.
type Mailer struct {
	transport Transport
	from      string
}

// New returns a Mailer that sends through Resend. It keeps the signature it
// has always had, so code written against it compiles unchanged. FromConfig is
// the constructor that honours MAIL_MAILER.
func New(apiKey, from string) *Mailer {
	return NewWithTransport(NewResend(apiKey), from)
}

// NewWithTransport returns a Mailer over any transport, including the fake in
// internal/mail/mailtest.
func NewWithTransport(t Transport, from string) *Mailer {
	return &Mailer{transport: t, from: from}
}

// Driver names the transport: "smtp", "resend", "failover(smtp,log)" and so on.
func (m *Mailer) Driver() string {
	return m.transport.Name()
}

// From is the address a message without its own From is sent from.
func (m *Mailer) From() string {
	return m.from
}

// SendOptions configures an email to send.
type SendOptions struct {
	To       string
	Subject  string
	Template string
	Data     map[string]interface{}
}

// Send renders a template from EmailTemplates and sends it.
func (m *Mailer) Send(ctx context.Context, opts SendOptions) error {
	htmlBody, err := m.renderTemplate(opts.Template, opts.Data)
	if err != nil {
		return fmt.Errorf("rendering template %q: %w", opts.Template, err)
	}
	return m.SendMessage(ctx, &Message{To: []string{opts.To}, Subject: opts.Subject, HTML: htmlBody})
}

// SendRaw sends an email with raw HTML content (no template rendering).
func (m *Mailer) SendRaw(ctx context.Context, to, subject, htmlBody string) error {
	return m.SendMessage(ctx, &Message{To: []string{to}, Subject: subject, HTML: htmlBody})
}

// SendMessage sends a message using any of Message's fields: several
// recipients, cc, bcc, reply-to, a text part, attachments and headers.
func (m *Mailer) SendMessage(ctx context.Context, msg *Message) error {
	if msg == nil {
		return errors.New("mail: nil message")
	}
	out := *msg
	if out.From == "" {
		out.From = m.from
	}
	if err := out.Validate(); err != nil {
		return err
	}
	return m.transport.Send(ctx, &out)
}

func (m *Mailer) renderTemplate(name string, data map[string]interface{}) (string, error) {
	tmplStr, ok := EmailTemplates[name]
	if !ok {
		return "", fmt.Errorf("template %q not found", name)
	}

	tmpl, err := template.New(name).Parse(tmplStr)
	if err != nil {
		return "", fmt.Errorf("parsing template %q: %w", name, err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("executing template %q: %w", name, err)
	}

	return buf.String(), nil
}
