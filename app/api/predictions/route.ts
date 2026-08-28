import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json({
    code: "INDIVIDUAL_PREDICTION_DISABLED",
    message: "Individual prediction is disabled. Validate and run an inference-only dataset from Batch Predictions.",
  }, { status: 410 })
}
