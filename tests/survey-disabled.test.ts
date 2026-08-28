import { describe, expect, it } from "vitest"
import { POST } from "@/app/api/surveys/route"

describe("import-only data-source policy", () => {
  it("rejects legacy public survey submissions", async () => {
    const response = await POST()
    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toMatchObject({
      code: "SURVEY_COLLECTION_DISABLED",
    })
  })
})
