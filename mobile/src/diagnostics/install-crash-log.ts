// Side-effect import, kept FIRST in app/_layout.tsx so the handler is in place
// before the other modules are evaluated.
import { installCrashLog } from './crash-log';

installCrashLog();
