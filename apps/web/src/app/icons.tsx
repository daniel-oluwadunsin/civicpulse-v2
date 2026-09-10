import type { ComponentType, SVGProps } from "react";
import {
  Activity,
  AddCircle,
  ArrowRight,
  Building,
  Category,
  Chart,
  CloseCircle,
  DocumentText,
  Element3,
  Eye,
  GalleryAdd,
  Global,
  HambergerMenu,
  Heart,
  Home2,
  Location,
  Map1,
  Message,
  Moon,
  Notification,
  People,
  Profile,
  SearchNormal1,
  SecuritySafe,
  Send2,
  Setting2,
  ShieldTick,
  Sun1,
  TickCircle,
} from "iconsax-react";

// The registry is intentionally colocated so Icon remains the single public wrapper.
// eslint-disable-next-line react-refresh/only-export-components
export const Icons = {
  activity: Activity,
  add: AddCircle,
  arrow: ArrowRight,
  building: Building,
  category: Category,
  chart: Chart,
  close: CloseCircle,
  document: DocumentText,
  dashboard: Element3,
  eye: Eye,
  gallery: GalleryAdd,
  globe: Global,
  menu: HambergerMenu,
  heart: Heart,
  home: Home2,
  location: Location,
  map: Map1,
  message: Message,
  moon: Moon,
  notification: Notification,
  people: People,
  profile: Profile,
  report: Send2,
  search: SearchNormal1,
  security: SecuritySafe,
  settings: Setting2,
  shield: ShieldTick,
  sun: Sun1,
  success: TickCircle,
} as const;

type IconName = keyof typeof Icons;

export function Icon({
  name,
  size = 20,
  label,
  variant = "Linear",
  className,
}: {
  name: IconName;
  size?: number;
  label?: string;
  variant?: "Linear" | "Bold" | "Outline" | "TwoTone" | "Bulk" | "Broken";
  className?: string;
}) {
  const Glyph = Icons[name] as ComponentType<
    SVGProps<SVGSVGElement> & { size?: number; variant?: string }
  >;
  return (
    <Glyph
      size={size}
      variant={variant}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
