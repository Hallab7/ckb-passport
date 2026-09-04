import { apiErrorResponse, readJsonRecord, verifyProofFromUi } from "../../../lib/server-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonRecord(request);
    const result = await verifyProofFromUi(body);
    return result.response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
