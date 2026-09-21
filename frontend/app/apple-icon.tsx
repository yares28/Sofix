import { ImageResponse } from "next/og";
import { stripeIcon } from "../lib/appIcon";

// iPhone home-screen icon ("Add to Home Screen"). iOS rounds the corners itself, so the square is filled.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(stripeIcon(180, false), size);
}
