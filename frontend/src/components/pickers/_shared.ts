/* Shared bits across the TaskSheet field pickers (#73, ported from Tasklog Business).
 * The picker-row className lives here so an a11y or token tweak lands in one place. */

export const PICKER_ROW_CLASS =
  "w-full flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-md text-left " +
  "hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent " +
  "focus:ring-offset-1 transition-colors duration-150 cursor-pointer";
