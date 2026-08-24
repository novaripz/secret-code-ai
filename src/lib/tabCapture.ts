// Captures a single frame of whatever the student picks in the browser's
// native "share your screen/window/tab" prompt. This never happens silently —
// the browser itself always shows a permission dialog naming what will be shared,
// and we stop the stream immediately after grabbing one frame.

export interface CapturedImage {
  dataUrl: string;
  base64: string;
  mimeType: string;
}

export async function captureTabScreenshot(): Promise<CapturedImage> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Your browser doesn't support screen capture. Try uploading a screenshot instead.");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "browser" } as MediaTrackConstraints,
    // @ts-expect-error -- experimental, hints Chrome to preselect "this tab"
    preferCurrentTab: true,
  });

  try {
    const track = stream.getVideoTracks()[0];
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();

    // Give the video element a tick to report real dimensions.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create a canvas to capture the screenshot.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    track.stop();
    video.pause();
    video.srcObject = null;

    const mimeType = "image/png";
    const dataUrl = canvas.toDataURL(mimeType);
    const base64 = dataUrl.split(",")[1] ?? "";
    return { dataUrl, base64, mimeType };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

export function readFileAsImage(file: File): Promise<CapturedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve({ dataUrl, base64, mimeType: file.type || "image/png" });
    };
    reader.onerror = () => reject(new Error("Could not read that image file."));
    reader.readAsDataURL(file);
  });
}
