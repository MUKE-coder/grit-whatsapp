import Constants from "expo-constants";

/**
 * The app's own name, from app.json.
 *
 * Everything on screen is this project's, not the framework's: the auth
 * screens used to render assets/icon.png, which every scaffold shipped as the
 * Grit logo, so a new app showed somebody else's brand before anybody had
 * signed in.
 */
export const APP_NAME: string = Constants.expoConfig?.name ?? "App";

/** The first letter, for the lettermark the auth screens draw. */
export const APP_INITIAL: string = (APP_NAME.trim()[0] ?? "A").toUpperCase();
