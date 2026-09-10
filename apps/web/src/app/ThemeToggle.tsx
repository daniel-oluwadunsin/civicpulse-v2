import { Icon } from "./icons";
import { useTheme } from "./theme";
export function ThemeToggle() {
  const { resolved, preference, setPreference } = useTheme();
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={`Theme: ${preference}. Switch to ${resolved === "dark" ? "light" : "dark"}`}
      title={`Theme: ${preference}`}
      onClick={() => setPreference(resolved === "dark" ? "light" : "dark")}
    >
      <Icon name={resolved === "dark" ? "sun" : "moon"} />
    </button>
  );
}
