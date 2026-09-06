/**
 * VisionSphere - Unified Vercel API
 *
 * Handles:
 *   - Supabase authentication
 *   - Supabase user/session verification
 *   - Intel likes
 *   - Intel comments
 *   - Turso intel stream
 *   - Private S3/iDrive vault
 *   - CZML layer listing
 *   - CZML layer retrieval
 *   - Country dossiers
 *   - General news
 *   - Geospatial assets
 *
 * IMPORTANT:
 *   Never hard-code secrets into this file.
 *   Put them in Vercel Environment Variables.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createTursoClient } from "@libsql/client";
import {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand
} from "@aws-sdk/client-s3";

/* =========================================================
   ENVIRONMENT
   ========================================================= */

const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,

    TURSO_URL,
    TURSO_TOKEN,

    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,

    VAULT_BUCKET,
    VAULT_ENDPOINT,
    VAULT_REGION,

    FRONTEND_URL
} = process.env;

/* =========================================================
   VALIDATION
   ========================================================= */

function requireEnv(name, value) {
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

requireEnv("SUPABASE_URL", SUPABASE_URL);
requireEnv("SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);
requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);

requireEnv("TURSO_URL", TURSO_URL);
requireEnv("TURSO_TOKEN", TURSO_TOKEN);

requireEnv("AWS_ACCESS_KEY_ID", AWS_ACCESS_KEY_ID);
requireEnv("AWS_SECRET_ACCESS_KEY", AWS_SECRET_ACCESS_KEY);

requireEnv("VAULT_BUCKET", VAULT_BUCKET);
requireEnv("VAULT_ENDPOINT", VAULT_ENDPOINT);
requireEnv("VAULT_REGION", VAULT_REGION);

/* =========================================================
   CLIENTS
   ========================================================= */

/**
 * Public/normal Supabase client.
 *
 * This is used for operations that are tied to a user's
 * authentication context.
 */
const supabaseAuthClient = createSupabaseClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

/**
 * SERVER-ONLY Supabase client.
 *
 * NEVER return this key to the browser.
 */
const supabaseAdmin = createSupabaseClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

/**
 * Turso server-side client.
 */
const turso = createTursoClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN
});

/**
 * Private S3/iDrive client.
 */
const vault = new S3Client({
    endpoint: VAULT_ENDPOINT,
    region: VAULT_REGION,

    forcePathStyle: true,

    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
    }
});

/* =========================================================
   COMMON HEADERS
   ========================================================= */

function setCors(res) {
    const origin =
        FRONTEND_URL ||
        "https://vision-sphere-share.vercel.app";

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.setHeader(
        "Cache-Control",
        "no-store"
    );
}

/* =========================================================
   RESPONSE HELPERS
   ========================================================= */

function sendJson(res, status, payload) {
    return res.status(status).json(payload);
}

function success(res, payload = {}) {
    return sendJson(res, 200, {
        success: true,
        ...payload
    });
}

function failure(res, status, message) {
    return sendJson(res, status, {
        success: false,
        error: message
    });
}

/* =========================================================
   REQUEST HELPERS
   ========================================================= */

function getBearerToken(req) {
    const authorization = req.headers.authorization;

    if (!authorization) {
        return null;
    }

    if (!authorization.startsWith("Bearer ")) {
        return null;
    }

    return authorization.slice("Bearer ".length).trim();
}

function getBody(req) {
    if (!req.body) {
        return {};
    }

    if (typeof req.body === "object") {
        return req.body;
    }

    try {
        return JSON.parse(req.body);
    } catch {
        return {};
    }
}

/* =========================================================
   USER AUTHENTICATION
   ========================================================= */

async function getAuthenticatedUser(req) {
    const token = getBearerToken(req);

    if (!token) {
        return {
            user: null,
            error: "Missing Authorization header"
        };
    }

    const {
        data,
        error
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
        return {
            user: null,
            error: "Invalid or expired session"
        };
    }

    return {
        user: data.user,
        error: null
    };
}

async function requireAuthenticatedUser(req, res) {
    const result = await getAuthenticatedUser(req);

    if (!result.user) {
        failure(
            res,
            401,
            result.error || "Authentication required"
        );

        return null;
    }

    return result.user;
}

/* =========================================================
   SUPABASE AUTH - LOGIN
   ========================================================= */

async function authLogin(req, res) {
    const body = getBody(req);

    const email = String(body.email || "")
        .trim()
        .toLowerCase();

    const password = String(body.password || "");

    if (!email || !password) {
        return failure(
            res,
            400,
            "Email and password are required."
        );
    }

    const {
        data,
        error
    } = await supabaseAuthClient.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        return failure(
            res,
            401,
            error.message
        );
    }

    return success(res, {
        session: data.session,
        user: data.user
    });
}

/* =========================================================
   SUPABASE AUTH - SIGN UP
   ========================================================= */

async function authSignup(req, res) {
    const body = getBody(req);

    const email = String(body.email || "")
        .trim()
        .toLowerCase();

    const password = String(body.password || "");

    if (!email || !password) {
        return failure(
            res,
            400,
            "Email and password are required."
        );
    }

    if (password.length < 6) {
        return failure(
            res,
            400,
            "Password must be at least 6 characters."
        );
    }

    const {
        data,
        error
    } = await supabaseAuthClient.auth.signUp({
        email,
        password,

        options: {
            emailRedirectTo:
                FRONTEND_URL || undefined
        }
    });

    if (error) {
        return failure(
            res,
            400,
            error.message
        );
    }

    return success(res, {
        session: data.session,
        user: data.user
    });
}

/* =========================================================
   SUPABASE AUTH - GOOGLE
   ========================================================= */

async function authGoogle(req, res) {
    const {
        data,
        error
    } = await supabaseAuthClient.auth.signInWithOAuth({
        provider: "google",

        options: {
            redirectTo:
                FRONTEND_URL || undefined
        }
    });

    if (error) {
        return failure(
            res,
            400,
            error.message
        );
    }

    return success(res, {
        url: data.url
    });
}

/* =========================================================
   CURRENT USER
   ========================================================= */

async function authMe(req, res) {
    const user = await requireAuthenticatedUser(
        req,
        res
    );

    if (!user) {
        return;
    }

    return success(res, {
        user
    });
}

/* =========================================================
   TURSO - INTEL STREAM
   ========================================================= */

const INTEL_COLUMNS = `
    id,
    title,
    intensity,
    context,
    source,
    location_name,
    latitude,
    longitude,
    video_url,
    photo_url,
    created_at
`;

/**
 * GET /api/index?action=intel
 *
 * Optional:
 *   ?node=123
 *   ?node=https://example.com/source
 */
async function getIntel(req, res) {
    const node =
        req.query?.node
            ? String(req.query.node).trim()
            : "";

    try {
        /* -----------------------------------------
           Specific node
        ----------------------------------------- */

        if (node) {
            let result;

            if (/^\d+$/.test(node)) {
                result = await turso.execute({
                    sql: `
                        SELECT
                            ${INTEL_COLUMNS}
                        FROM intel_stream
                        WHERE id = ?
                        LIMIT 1
                    `,
                    args: [Number(node)]
                });
            } else {
                result = await turso.execute({
                    sql: `
                        SELECT
                            ${INTEL_COLUMNS}
                        FROM intel_stream
                        WHERE source = ?
                        LIMIT 1
                    `,
                    args: [node]
                });
            }

            return success(res, {
                data: result.rows || []
            });
        }

        /* -----------------------------------------
           Standard feed
        ----------------------------------------- */

        const since =
            new Date(
                Date.now() -
                72 * 60 * 60 * 1000
            ).toISOString();

        const result =
            await turso.execute({
                sql: `
                    SELECT
                        ${INTEL_COLUMNS}
                    FROM intel_stream
                    WHERE created_at >= ?
                    ORDER BY created_at DESC
                `,
                args: [since]
            });

        return success(res, {
            data: result.rows || []
        });

    } catch (error) {
        console.error(
            "[TURSO_INTEL_ERROR]",
            error
        );

        return failure(
            res,
            500,
            "Failed to retrieve intelligence data."
        );
    }
}

/* =========================================================
   SUPABASE - LIKES
   ========================================================= */

/**
 * GET /api/index?action=likes&intel_id=123
 */
async function getLikes(req, res) {
    const intelId = req.query?.intel_id || req.query?.node;

    if (!intelId) {
        return failure(
            res,
            400,
            "intel_id is required."
        );
    }

    try {
        const {
            data,
            error
        } = await supabaseAdmin
            .from("intel_likes")
            .select("user_id")
            .eq("intel_id", intelId);

        if (error) {
            throw error;
        }

        return success(res, {
            data: data || [],
            count: data?.length || 0
        });

    } catch (error) {
        console.error(
            "[SUPABASE_LIKES_ERROR]",
            error
        );

        return failure(
            res,
            500,
            "Failed to retrieve likes."
        );
    }
}

/* =========================================================
   SUPABASE - ADD LIKE
   ========================================================= */

async function addLike(req, res) {
    const user =
        await requireAuthenticatedUser(
            req,
            res
        );

    if (!user) {
        return;
    }

    const body = getBody(req);

    const intelId = body.intel_id;

    if (!intelId) {
        return failure(
            res,
            400,
            "intel_id is required."
        );
    }

    try {
        const {
            data,
            error
        } = await supabaseAdmin
            .from("intel_likes")
            .insert([
                {
                    user_id: user.id,
                    intel_id: intelId
                }
            ])
            .select()
            .maybeSingle();

        if (error) {
            /*
             * If you have a unique constraint on
             * (user_id, intel_id), duplicate likes
             * will fail cleanly.
             */
            if (
                error.code === "23505"
            ) {
                return success(res, {
                    alreadyLiked: true
                });
            }

            throw error;
        }

        return success(res, {
            data
        });

    } catch (error) {
        console.error(
            "[SUPABASE_ADD_LIKE_ERROR]",
            error
        );

        return failure(
            res,
            500,
            "Failed to add like."
        );
    }
}

/* =========================================================
   SUPABASE - COMMENTS
   ========================================================= */

/**
 * GET /api/index?action=comments&intel_id=123
 */
async function getComments(req, res) {
    const intelId = req.query?.intel_id || req.query?.node;

    if (!intelId) {
        return failure(
            res,
            400,
            "intel_id is required."
        );
    }

    try {
        const {
            data,
            error
        } = await supabaseAdmin
            .from("intel_comments")
            .select(
                "id,user_id,intel_id,comment_text,created_at"
            )
            .eq("intel_id", intelId)
            .order(
                "created_at",
                {
                    ascending: true
                }
            );

        if (error) {
            throw error;
        }

        return success(res, {
            data: data || []
        });

    } catch (error) {
        console.error(
            "[SUPABASE_COMMENTS_ERROR]",
            error
        );

        return failure(
            res,
            500,
            "Failed to retrieve comments."
        );
    }
}

/* =========================================================
   SUPABASE - ADD COMMENT
   ========================================================= */

async function addComment(req, res) {
    const user =
        await requireAuthenticatedUser(
            req,
            res
        );

    if (!user) {
        return;
    }

    const body = getBody(req);

    const intelId = body.intel_id;
    const commentText =
        String(body.comment_text || "")
            .trim();

    if (!intelId) {
        return failure(
            res,
            400,
            "intel_id is required."
        );
    }

    if (!commentText) {
        return failure(
            res,
            400,
            "Comment cannot be empty."
        );
    }

    if (commentText.length > 2000) {
        return failure(
            res,
            400,
            "Comment is too long."
        );
    }

    try {
        const {
            data,
            error
        } = await supabaseAdmin
            .from("intel_comments")
            .insert([
                {
                    user_id: user.id,
                    intel_id: intelId,
                    comment_text: commentText
                }
            ])
            .select()
            .maybeSingle();

        if (error) {
            throw error;
        }

        return success(res, {
            data
        });

    } catch (error) {
        console.error(
            "[SUPABASE_ADD_COMMENT_ERROR]",
            error
        );

        return failure(
            res,
            500,
            "Failed to post comment."
        );
    }
}

/* =========================================================
   PRIVATE VAULT HELPERS
   ========================================================= */

async function readVaultObject(key) {
    const command =
        new GetObjectCommand({
            Bucket: VAULT_BUCKET,
            Key: key
        });

    const response =
        await vault.send(command);

    if (!response.Body) {
        throw new Error(
            "Vault object contained no body."
        );
    }

    /*
     * AWS SDK v3 Body provides transformToString()
     * in Node.js runtimes.
     */
    const text =
        await response.Body.transformToString(
            "utf-8"
        );

    return text;
}

/* =========================================================
   PRIVATE VAULT - LIST CZML
   ========================================================= */

/**
 * GET /api/index?action=layers
 */
async function listLayers(req, res) {
    try {
        const response =
            await vault.send(
                new ListObjectsV2Command({
                    Bucket: VAULT_BUCKET
                })
            );

        const objects =
            response.Contents || [];

        const layers = objects
            .filter(
                obj =>
                    typeof obj.Key === "string" &&
                    obj.Key
                        .toLowerCase()
                        .endsWith(".czml")
            )
            .map(obj => ({
                key: obj.Key,
                size: obj.Size || 0,
                lastModified:
                    obj.LastModified || null
            }));

        return success(res, {
            data: layers
        });

    } catch (error) {
        console.error(
            "[VAULT_LIST_ERROR]",
            error
        );

        return failure(
            res,
            500,
            "Failed to list intelligence layers."
        );
    }
}

/* =========================================================
   PRIVATE VAULT - CZML
   ========================================================= */

/**
 * GET /api/index?action=layer&key=filename.czml
 */
async function getLayer(req, res) {
    const key =
        String(req.query?.key || "")
            .trim();

    if (!key) {
        return failure(
            res,
            400,
            "key is required."
        );
    }

    /*
     * Prevent path-style abuse.
     *
     * Only allow CZML assets from the root.
     */
    if (
        key.includes("..") ||
        key.includes("/") ||
        !key.toLowerCase().endsWith(".czml")
    ) {
        return failure(
            res,
            400,
            "Invalid layer key."
        );
    }

    try {
        const text =
            await readVaultObject(key);

        const payload =
            JSON.parse(text);

        return success(res, {
            data: payload
        });

    } catch (error) {
        console.error(
            "[VAULT_LAYER_ERROR]",
            error
        );

        return failure(
            res,
            404,
            "Unable to retrieve intelligence layer."
        );
    }
}

/* =========================================================
   PRIVATE VAULT - COUNTRY DOSSIER
   ========================================================= */

/**
 * GET /api/index?action=dossier&country=myanmar
 */
async function getDossier(req, res) {
    // Change the country variable definition:
    const country = String(req.query?.country || req.query?.slug || "").trim().toLowerCase();

    if (!country) {
        return failure(
            res,
            400,
            "country is required."
        );
    }

    /*
     * Reproduce your current slug rules.
     */
    const slug = country
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "_");

    const key =
        `dossiers/${slug}_crmm_left_hand.json`;

    try {
        const text =
            await readVaultObject(key);

        const payload =
            JSON.parse(text);

        return success(res, {
            data: payload
        });

    } catch (error) {
        console.error(
            "[DOSSIER_ERROR]",
            error
        );

        return failure(
            res,
            404,
            "Country dossier not found."
        );
    }
}

/* =========================================================
   PRIVATE VAULT - GENERAL NEWS
   ========================================================= */

/**
 * GET /api/index?action=news
 */
async function getGeneralNews(req, res) {
    try {
        const text =
            await readVaultObject(
                "General_news.json"
            );

        const data =
            JSON.parse(text);

        return success(res, {
            data
        });

    } catch (error) {
        console.error(
            "[GENERAL_NEWS_ERROR]",
            error
        );

        return failure(
            res,
            404,
            "General news unavailable."
        );
    }
}

/* =========================================================
   PRIVATE VAULT - GEOSPATIAL FILE
   ========================================================= */

/**
 * GET /api/index?action=geospatial&country=myanmar
 *
 * Searches:
 *   geospatial/
 *
 * Uses country slug/name to find matching asset.
 */
async function getGeospatial(req, res) {
    const country = String(req.query?.country || req.query?.slug || "").trim().toLowerCase();

    if (!country) {
        return failure(
            res,
            400,
            "country is required."
        );
    }

    const slug = country
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "_");

    try {
        const response =
            await vault.send(
                new ListObjectsV2Command({
                    Bucket: VAULT_BUCKET,
                    Prefix: "geospatial/"
                })
            );

        const objects =
            response.Contents || [];

        const candidate =
            objects.find(obj => {
                const key =
                    String(obj.Key || "")
                        .toLowerCase();

                return (
                    key.includes(slug) &&
                    (
                        key.endsWith(".czml") ||
                        key.endsWith(".geojson") ||
                        key.endsWith(".json")
                    )
                );
            });

        if (!candidate?.Key) {
            return failure(
                res,
                404,
                "No matching geospatial asset found."
            );
        }

        const text =
            await readVaultObject(
                candidate.Key
            );

        let payload;

        try {
            payload = JSON.parse(text);
        } catch {
            payload = text;
        }

        return success(res, {
            key: candidate.Key,
            data: payload
        });

    } catch (error) {
        console.error(
            "[GEOSPATIAL_ERROR]",
            error
        );

        return failure(
            res,
            500,
            "Failed to retrieve geospatial asset."
        );
    }
}

/* =========================================================
   ROUTER
   ========================================================= */

async function route(req, res) {
    const action =
        String(req.query?.action || "")
            .trim()
            .toLowerCase();

    /* -----------------------------------------
       Authentication
    ----------------------------------------- */

    if (
        action === "login" &&
        req.method === "POST"
    ) {
        return authLogin(req, res);
    }

    if (
        action === "signup" &&
        req.method === "POST"
    ) {
        return authSignup(req, res);
    }

    if (
        action === "google" &&
        req.method === "GET"
    ) {
        return authGoogle(req, res);
    }

    if (
        action === "me" &&
        req.method === "GET"
    ) {
        return authMe(req, res);
    }
    /* -----------------------------------------
       Live Translation
    ----------------------------------------- */

    if (
        action === "languages" &&
        req.method === "GET"
    ) {
        return getTranslationLanguages(req, res);
    }

    if (
        action === "translate" &&
        (req.method === "POST" || req.method === "GET")
    ) {
        return handleTranslation(req, res);
    }
    
    /* -----------------------------------------
       Intel
    ----------------------------------------- */

    if (
        action === "intel" &&
        req.method === "GET"
    ) {
        return getIntel(req, res);
    }

    /* -----------------------------------------
       Likes
    ----------------------------------------- */

    if (
        action === "likes" &&
        req.method === "GET"
    ) {
        return getLikes(req, res);
    }

    if (
        action === "like" &&
        req.method === "POST"
    ) {
        return addLike(req, res);
    }

    /* -----------------------------------------
       Comments
    ----------------------------------------- */

    if (
        action === "comments" &&
        req.method === "GET"
    ) {
        return getComments(req, res);
    }

    if (
        action === "comment" &&
        req.method === "POST"
    ) {
        return addComment(req, res);
    }

    /* -----------------------------------------
       Private vault
    ----------------------------------------- */

    if (
        action === "layers" &&
        req.method === "GET"
    ) {
        return listLayers(req, res);
    }

    if (
        action === "layer" &&
        req.method === "GET"
    ) {
        return getLayer(req, res);
    }

    if (
        action === "dossier" &&
        req.method === "GET"
    ) {
        return getDossier(req, res);
    }

    if (
        action === "news" &&
        req.method === "GET"
    ) {
        return getGeneralNews(req, res);
    }

    if (
        action === "geospatial" &&
        req.method === "GET"
    ) {
        return getGeospatial(req, res);
    }

    return failure(
        res,
        404,
        "Unknown API endpoint."
    );
}

/* =========================================================
   TRANSLATION SERVICE HELPERS
   ========================================================= */

/**
 * Fetch translation from Lingva
 */
async function fetchLingvaTranslation(text, source = "auto", target = "en") {
    try {
        const url = `https://lingva.ml/api/v1/${encodeURIComponent(source)}/${encodeURIComponent(target)}/${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data.translation || null;
    } catch (err) {
        console.error("[LINGVA_ERROR]", err);
        return null;
    }
}

/**
 * Fetch translation from MyMemory as a fallback
 */
async function fetchMyMemoryTranslation(text, source = "en", target = "fr") {
    try {
        const src = source === "auto" ? "en" : source;
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(src)}|${encodeURIComponent(target)}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data?.responseData?.translatedText || null;
    } catch (err) {
        console.error("[MYMEMORY_ERROR]", err);
        return null;
    }
}

/* =========================================================
   TRANSLATION ENDPOINTS
   ========================================================= */

/**
 * GET /api/index?action=languages
 */
async function getTranslationLanguages(req, res) {
    try {
        const response = await fetch("https://lingva.ml/api/v1/languages/target");
        if (response.ok) {
            const data = await response.json();
            return success(res, { languages: data.languages || data });
        }
    } catch (error) {
        console.warn("[LANGUAGES_FETCH_FALLBACK]", error);
    }

    // Static fallback list if external service is unreachable
    const fallbackLanguages = [
        { code: "en", name: "English" },
        { code: "es", name: "Spanish" },
        { code: "fr", name: "French" },
        { code: "de", name: "German" },
        { code: "zh", name: "Chinese" },
        { code: "my", name: "Myanmar (Burmese)" },
        { code: "ar", name: "Arabic" },
        { code: "ru", name: "Russian" }
    ];

    return success(res, { languages: fallbackLanguages });
}

/* =========================================================
   TRANSLATION ENDPOINTS (UPGRADED)
   ========================================================= */
async function handleTranslation(req, res) {
    const body = getBody(req);
    const query = req.query || {};

    const source = String(body.source || query.source || "auto").trim();
    const target = String(body.target || query.target || "en").trim();
    const textData = body.text || query.text;

    if (!textData) {
        return failure(res, 400, "Text payload is required.");
    }

    // Helper to process single strings through Lingva/MyMemory
    async function translateSingle(str) {
        if (!str || typeof str !== 'string') return str;
        let t = await fetchLingvaTranslation(str, source, target);
        if (!t) t = await fetchMyMemoryTranslation(str, source, target);
        return t || str;
    }

    try {
        // Handle Dictionary Object Payload (from UI translation sync)
        if (typeof textData === 'object' && !Array.isArray(textData)) {
            const keys = Object.keys(textData);
            const translatedDict = {};
            
            // Process translation matrix concurrently 
            await Promise.all(keys.map(async (key) => {
                translatedDict[key] = await translateSingle(textData[key]);
            }));
            
            return success(res, { data: translatedDict, target });
        } 
        
        // Handle standard string payload
        const translatedText = await translateSingle(String(textData).trim());
        return success(res, { translatedText, target });

    } catch (error) {
        console.error("[TRANSLATION_FATAL]", error);
        return failure(res, 500, "Translation matrix failed.");
    }
}

/* =========================================================
   VERCEL ENTRY POINT
   ========================================================= */

export default async function handler(req, res) {
    setCors(res);

    /*
     * Preflight request
     */
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    try {
        return await route(req, res);
    } catch (error) {
        console.error(
            "[VERCEL_API_FATAL]",
            error
        );

        return failure(
            res,
            500,
            "Internal server error."
        );
    }
}