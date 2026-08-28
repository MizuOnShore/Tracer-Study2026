import { describe, expect, it } from "vitest"
import { POST } from "@/app/api/predictions/route"

describe("legacy individual prediction endpoint", () => {
  it("directs callers to the batch workflow", async () => {
    const response = await POST()
    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toMatchObject({ code: "INDIVIDUAL_PREDICTION_DISABLED" })
  })
})
