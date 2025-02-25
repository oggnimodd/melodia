import { onMount } from "svelte";

const useFullScreen = () => {
  let fullScreenStatus = $state({
    isActive: false,
  });

  const toggle = async () => {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        fullScreenStatus.isActive = true;
      } catch (err) {
        console.error("Error entering fullscreen:", err);
      }
    } else {
      try {
        await document.exitFullscreen();
        fullScreenStatus.isActive = false;
      } catch (err) {
        console.error("Error exiting fullscreen:", err);
      }
    }
  };

  onMount(() => {
    const handleFullscreenChange = () => {
      fullScreenStatus.isActive = !!document.fullscreenElement;
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  });

  return {
    fullscreen: fullScreenStatus,
    toggle,
  };
};

export default useFullScreen;
