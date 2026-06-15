# Task 15-a: Screen Wake Lock, Socket Reconnection, Wake Lock Indicator

## Summary
Modified `/home/z/my-project/src/app/votar/[codigo]/page.tsx` with 4 changes:

1. **Screen Wake Lock API** - Added useEffect that requests `navigator.wakeLock` to prevent phone screen from dimming/turning off during voting. Uses type assertion to avoid TypeScript issues. Re-acquires on visibility change. Released on unmount.

2. **Socket Reconnect Auto-Rejoin** - Modified `socket.on('reconnect')` handler to also emit `join-session` so the student is counted as a participant after reconnection.

3. **Socket Reconnection Settings** - Changed `reconnectionAttempts` from 5 to `Infinity`, `reconnectionDelay` from 2000 to 1000, added `reconnectionDelayMax: 5000`.

4. **Screen Active Indicator** - Added a pulsing green dot in the header (before the wifi icon) when `wakeLock` is available in navigator, with title "Tela mantida acesa".

## Files Modified
- `/home/z/my-project/src/app/votar/[codigo]/page.tsx` - All 4 changes applied
- `/home/z/my-project/worklog.md` - Work record appended

## Lint Result
- Clean, 0 errors
