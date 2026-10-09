# Switching Weigh Breaks to a passcode (Firebase console, ~3 minutes)

1. Firebase console > project "weighbreaks" > Build > Authentication > Sign-in method >
   Add new provider > Email/Password > Enable (leave "Email link" off) > Save.
2. Authentication > Users > Add user:
   - Email: sync@weighbreaks.app   (not a real inbox; it's never shown in the app)
   - Password: the passcode you want (6+ characters)
3. Firestore Database > Rules: replace everything with firestore.rules from this folder > Publish.
4. Upload storage.js and firestore.rules to the showbreaks repo (replace the old ones).

Your shows already in Firestore stay put. Each device asks for the passcode once, then stays unlocked.
To change the passcode later: Authentication > Users > delete sync@weighbreaks.app, then add it again
with the new password. Devices already unlocked stay unlocked until you tap "Lock this device".
