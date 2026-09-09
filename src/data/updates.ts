export interface AppUpdate {
  version: string;
  title: string;
  description: string;
  date: string;
}

export const APP_UPDATES: AppUpdate[] = [
  {
    version: "1.5.77",
    title: "Dynamic Per-Mile Financial Annotations",
    description: "Added dynamic annotations to the overview dashboard showing average rate per mile, expenses per mile, and profit per mile. These adjust dynamically depending on the selected filter period.",
    date: "Aug 2026"
  },
  {
    version: "1.5.75",
    title: "Tire Manufacturer, Model & Size in Settings",
    description: "Added dedicated inputs to specify the tire manufacturer, model, and size inside the settings window to support custom vehicle profiles and rolling resistance calibrations.",
    date: "Aug 2026"
  },
  {
    version: "1.5.72",
    title: "Transport LogIQ Visual Realignment",
    description: "Synchronized the progressive web app (PWA) manifest configurations, app icons, and spreadsheet download schemas with the new Transport LogIQ identity.",
    date: "Aug 2026"
  },
  {
    version: "1.5.70",
    title: "Single-Popup Notification Loop Resolution",
    description: "Streamlined the update dialog mechanics to resolve duplicate update notification loops and establish clean, mutually exclusive alert triggers.",
    date: "Aug 2026"
  },
  {
    version: "1.5.40",
    title: "Multi-axle rolling resistance",
    description: "Supports 1, 2, or 3-axle dually configurations to refine custom rolling resistance and dragging predictions.",
    date: "Jul 2026"
  },
  {
    version: "1.5.30",
    title: "Operational Unit specifications",
    description: "Register dedicated vehicle profiles with dry weights, GVWR, and multi-unit towing lengths.",
    date: "Jun 2026"
  },
  {
    version: "1.5.20",
    title: "Sidebar folder management",
    description: "Organize your workflow with custom workspaces, dragging and re-ordering sidebar directories.",
    date: "May 2026"
  }
];

export function parseVersion(v: string): number {
  const clean = v.replace(/^v/, '').trim();
  const parts = clean.split('.');
  if (parts.length === 3) {
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    const patch = parseInt(parts[2], 10);
    return (isNaN(major) ? 0 : major) * 1000000 + 
           (isNaN(minor) ? 0 : minor) * 1000 + 
           (isNaN(patch) ? 0 : patch);
  }
  return 0;
}

export function getUpdatesSince(lastSeenVersion: string | null, currentVersion: string): AppUpdate[] {
  const currentVal = parseVersion(currentVersion);
  const todayThreshold = parseVersion("1.5.70");
  
  if (!lastSeenVersion || lastSeenVersion === "development") {
    // Return all of today's updates by default (version >= 1.5.70)
    return APP_UPDATES.filter(u => parseVersion(u.version) >= todayThreshold);
  }

  const lastSeenVal = parseVersion(lastSeenVersion);

  // Filter updates released after the last seen version up to current version
  const updates = APP_UPDATES.filter(update => {
    const updateVal = parseVersion(update.version);
    return updateVal > lastSeenVal && updateVal <= currentVal;
  });

  // If there are no updates in the range, fallback to returning all of today's updates
  if (updates.length === 0) {
    return APP_UPDATES.filter(u => parseVersion(u.version) >= todayThreshold);
  }

  return updates;
}
