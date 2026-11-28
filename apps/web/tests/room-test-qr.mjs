import assert from "node:assert/strict";
import jsQR from "jsqr";

export async function decodeRoomInvitation(owner) {
  await owner.getByText("手机扫码加入", { exact: true }).click();
  const canvas = owner.getByRole("img", { name: "互传区邀请二维码" });
  const pixels = await canvas.evaluate(node => {
    const { width, height } = node;
    const data = node.getContext("2d").getImageData(0, 0, width, height).data;
    return { width, height, data: Array.from(data) };
  });
  const decoded = jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height, { inversionAttempts: "dontInvert" });
  assert.ok(decoded, "The displayed invitation QR code must be decodable");
  assert.equal(decoded.data, await owner.getByLabel("邀请链接", { exact: true }).inputValue());
  return decoded.data;
}
