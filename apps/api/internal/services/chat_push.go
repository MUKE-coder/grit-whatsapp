package services

import "strings"

// ChatPush turns a new message into a push notification for the members who
// should hear about it (the chat service leaves out the sender and anyone who
// muted the conversation). It sends in the background, so sending a message
// never waits on the push service.
func ChatPush(push *Push) func(recipients []string, msg MessageView, from ChatUser) {
	return func(recipients []string, msg MessageView, from ChatUser) {
		body := msg.Body
		switch msg.Kind {
		case "image":
			body = "📷 Photo"
		case "file":
			body = "📎 File"
		}
		push.Go(recipients, PushMessage{
			Title: strings.TrimSpace(from.FirstName + " " + from.LastName),
			Body:  truncate(body, 180),
			Sound: "default",
			// What the app opens when the notification is tapped.
			Data: map[string]string{"conversation_id": msg.ConversationID},
		})
	}
}
