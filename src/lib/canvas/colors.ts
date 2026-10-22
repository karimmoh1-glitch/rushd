import { CLASS_COLORS } from "@/lib/class-colors";

/** Colors handed to classes Rushd creates from Canvas courses, cycling the
 * same restrained palette students pick from by hand. */
export const CANVAS_CLASS_COLORS: string[] = CLASS_COLORS.map((c) => c.value);
