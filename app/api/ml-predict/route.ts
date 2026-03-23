import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_URL = process.env.ML_API_URL || 'http://127.0.0.1:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const response = await fetch(`${FASTAPI_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return NextResponse.json({ error: 'ML service error' }, { status: 502 });
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'ML service unavailable' }, { status: 503 });
  }
}

export async function GET() {
  try {
    const response = await fetch(`${FASTAPI_URL}/health`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'ML service unavailable' }, { status: 503 });
  }
}
