import { createClient } from '@libsql/client/web';

// --- CONFIGURATION ---
const APP_URL = process.env.APP_URL || "https://vision-sphere-gold.vercel.app";

export const config = {
  runtime: 'edge',
};

interface IntelNode {
  id: string;
  title: string;
  intensity?: string;
  context: string;
  source: string; // This corresponds to your table's 'source' column
  location_name?: string;
  latitude: number;
  longitude: number;
  video_url?: string;
  photo_url: string;
  created_at: string;
}

// --- HELPER ---
const isUrl = (str: string | null): boolean => 
  !!str && (str.startsWith('http://') || str.startsWith('https://'));

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const nodeId = url.searchParams.get('node');
    const redirectUrl = `${APP_URL}/?targetNode=${nodeId || ''}`;

    const turso = createClient({
      url: process.env.TURSO_DATABASE_URL || "",
      authToken: process.env.TURSO_AUTH_TOKEN || "",
    });

    let node: IntelNode | null = null;

    // --- FETCH LOGIC ---
    if (nodeId) {
      try {
        // Toggle lookup: 'source' column for URLs, 'id' column for IDs
        const column = isUrl(nodeId) ? "source" : "id";

        const queryResult = await turso.execute({
          sql: `SELECT * FROM intel_stream WHERE ${column} = ? LIMIT 1`,
          args: [nodeId]
        });
        
        if (queryResult.rows && queryResult.rows.length > 0) {
          node = queryResult.rows[0] as unknown as IntelNode;
        }
      } catch (dbErr) {
        console.error("[TURSO_QUERY_ERR]", dbErr);
      }
    }

    const cleanText = (str: unknown): string => String(str || "").replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
    const truncate = (str: string, max: number): string => str.length > max ? str.slice(0, max - 3) + '...' : str;
    const safeBaseUrl = APP_URL.replace(/\/$/, '');

    const isFound = !!node;
    const rawTitle = isFound ? node!.title : "REDACTED_NODE";
    const rawContext = isFound ? node!.context : "Access Denied. Node coordinates compromised, archived, or not found.";

    const meta = {
      title: cleanText(`🛰️ VS_INTEL | ${rawTitle}`),
      desc: cleanText(truncate(rawContext, 155)),
      // Flawless Image Fallback
      image: (isFound && node!.photo_url && node!.photo_url.toLowerCase() !== "none" && node!.photo_url.trim() !== "") 
        ? String(node!.photo_url).trim() 
        : `${safeBaseUrl}/VS-Logo-01.jpg`,
      url: redirectUrl
    };

    // 5. The Premium Visual Routing Payload
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${meta.title}</title>

          <meta property="og:site_name" content="Vision Sphere">
          <meta property="og:type" content="website">
          <meta property="og:url" content="${meta.url}">
          <meta property="og:title" content="${meta.title}">
          <meta property="og:description" content="${meta.desc}">
          <meta property="og:image" content="${meta.image}">
          
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="${meta.title}">
          <meta name="twitter:description" content="${meta.desc}">
          <meta name="twitter:image" content="${meta.image}">
          
          <meta name="theme-color" content="#00f2ff">

          <meta http-equiv="refresh" content="0; url=${redirectUrl}">

          <style>
              :root { --cyan: #00f2ff; --bg: #02060a; }
              body {
                  background-color: var(--bg);
                  color: var(--cyan);
                  font-family: 'JetBrains Mono', 'Courier New', Courier, monospace;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  height: 100vh;
                  margin: 0;
                  text-align: center;
                  overflow: hidden;
              }
              
              /* Tactical Radar Animation */
              .radar-scanner {
                  width: 60px;
                  height: 60px;
                  border: 1px solid rgba(0, 242, 255, 0.2);
                  border-radius: 50%;
                  position: relative;
                  margin-bottom: 25px;
                  box-shadow: 0 0 20px rgba(0, 242, 255, 0.05), inset 0 0 15px rgba(0, 242, 255, 0.1);
              }
              .radar-scanner::after {
                  content: '';
                  position: absolute;
                  top: 50%;
                  left: 50%;
                  width: 50%;
                  height: 2px;
                  background: var(--cyan);
                  transform-origin: 0% 50%;
                  animation: radar-spin 1.5s linear infinite;
                  box-shadow: 0 0 10px var(--cyan);
              }
              @keyframes radar-spin {
                  100% { transform: rotate(360deg); }
              }

              .glitch-text { 
                  font-size: 13px; 
                  font-weight: bold; 
                  letter-spacing: 3px; 
                  text-transform: uppercase; 
                  animation: text-pulse 2s infinite;
              }
              @keyframes text-pulse { 
                  0%, 100% { opacity: 1; text-shadow: 0 0 8px rgba(0,242,255,0.4); } 
                  50% { opacity: 0.5; text-shadow: none; } 
              }

              .manual-link { 
                  margin-top: 40px; 
                  color: rgba(0, 242, 255, 0.4); 
                  text-decoration: none; 
                  font-size: 10px; 
                  letter-spacing: 1px;
                  border-bottom: 1px dashed rgba(0, 242, 255, 0.2); 
                  padding-bottom: 3px; 
                  transition: all 0.2s; 
              }
              .manual-link:hover { 
                  color: var(--cyan); 
                  border-color: var(--cyan); 
              }
          </style>
      </head>
      <body>
          <div class="radar-scanner"></div>
          <div class="glitch-text">Routing to Vision Sphere...</div>
          <a href="${redirectUrl}" class="manual-link">BYPASS AUTO-ROUTING</a>

          <script>
              setTimeout(() => {
                  window.location.replace("${redirectUrl}");
              }, 100);
          </script>
      </body>
      </html>
    `;

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        // Cache the metadata for 5 minutes at Vercel's edge network
        "Cache-Control": "s-maxage=300, stale-while-revalidate=300", 
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (err: unknown) {
    console.error("[UPLINK_FATAL]", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown System Failure";
    return new Response(`[SYSTEM_FAILURE]: ${errorMessage}`, { status: 500 });
  }
}