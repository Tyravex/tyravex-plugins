import { useEffect, useState } from "react";

const desktopQuery = "(min-width: 1280px)";

export function useSupportDetailsDisclosure() {
  const [desktop, setDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia?.(desktopQuery).matches ?? window.innerWidth >= 1280),
  );
  const [expanded, setExpanded] = useState<boolean | null>(null);
  useEffect(() => {
    const media = window.matchMedia?.(desktopQuery);
    if (!media) return;
    const update = () => {
      setDesktop(media.matches);
      setExpanded(null);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return { desktop, open: expanded ?? desktop, setExpanded };
}
