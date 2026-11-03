import { getBlogConfig } from "@/lib/blog/config";
import { HttpError, parseRetryAfter, withRetry } from "@/lib/blog/retry";

// Shopify Admin GraphQL for the blog pipeline. Dev Dashboard apps only show a
// client ID and secret, so the token comes from the client credentials grant
// (valid 24h, cached here). SHOPIFY_ADMIN_ACCESS_TOKEN overrides it for a
// legacy custom app that has a static token.

let cachedToken: { value: string; expiresAt: number } | null = null;

async function requestClientCredentialsToken(): Promise<string> {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (or SHOPIFY_ADMIN_ACCESS_TOKEN) are required"
    );
  }
  const { shopDomain } = getBlogConfig();
  return withRetry("Shopify token", async () => {
    const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      throw new HttpError(
        `Shopify token request failed (${response.status}): ${
          data.error_description || data.error || JSON.stringify(data)
        }`,
        response.status
      );
    }
    const expiresIn = Number(data.expires_in ?? 86399);
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (expiresIn - 60) * 1000,
    };
    return data.access_token as string;
  });
}

async function getAccessToken(): Promise<string> {
  const staticToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (staticToken) return staticToken;
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  return requestClientCredentialsToken();
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

export async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const { shopDomain, apiVersion } = getBlogConfig();
  return withRetry("Shopify GraphQL", async () => {
    const token = await getAccessToken();
    const response = await fetch(
      `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (response.status === 401) cachedToken = null;
    const payload = (await response.json().catch(() => ({}))) as GraphQLResponse<T>;
    if (!response.ok) {
      throw new HttpError(
        `Shopify GraphQL ${response.status}: ${
          payload.errors?.map((e) => e.message).join("; ") ?? response.statusText
        }`,
        response.status,
        parseRetryAfter(response.headers.get("retry-after"))
      );
    }
    if (payload.errors?.length) {
      const throttled = payload.errors.some((e) => e.extensions?.code === "THROTTLED");
      throw new HttpError(
        `Shopify GraphQL: ${payload.errors.map((e) => e.message).join("; ")}`,
        throttled ? 429 : 400,
        throttled ? 2000 : undefined
      );
    }
    return payload.data as T;
  });
}

function assertNoUserErrors(
  action: string,
  errors: Array<{ field?: string[] | null; message: string }> | undefined
) {
  if (errors?.length) {
    throw new Error(
      `${action}: ${errors
        .map((e) => (e.field?.length ? `${e.field.join(".")}: ${e.message}` : e.message))
        .join("; ")}`
    );
  }
}

let cachedBlog: { id: string; handle: string; title: string } | null = null;

export async function getBlog() {
  if (cachedBlog) return cachedBlog;
  const { blogHandle } = getBlogConfig();
  const data = await shopifyGraphQL<{
    blogs: { nodes: Array<{ id: string; handle: string; title: string }> };
  }>(
    `query Blog($query: String!) {
      blogs(first: 5, query: $query) { nodes { id handle title } }
    }`,
    { query: `handle:${blogHandle}` }
  );
  const blog = data.blogs.nodes.find((node) => node.handle === blogHandle);
  if (!blog) throw new Error(`Shopify blog "${blogHandle}" was not found`);
  cachedBlog = blog;
  return blog;
}

function numericId(gid: string): string {
  return gid.split("/").pop() ?? gid;
}

export interface ShopifyArticleSummary {
  id: string;
  title: string;
  handle: string;
  tags: string[];
  isPublished: boolean;
}

const ARTICLE_FIELDS = "id title handle tags isPublished";

export async function findArticleByHandle(
  handle: string
): Promise<ShopifyArticleSummary | null> {
  const blog = await getBlog();
  const data = await shopifyGraphQL<{ articles: { nodes: ShopifyArticleSummary[] } }>(
    `query ArticleByHandle($query: String!) {
      articles(first: 5, query: $query) { nodes { ${ARTICLE_FIELDS} } }
    }`,
    { query: `blog_id:${numericId(blog.id)} AND handle:'${handle}'` }
  );
  return data.articles.nodes.find((node) => node.handle === handle) ?? null;
}

/** Published articles in the blog carrying `tag`, newest first. */
export async function listArticlesByTag(
  tag: string,
  limit = 10
): Promise<ShopifyArticleSummary[]> {
  const blog = await getBlog();
  const data = await shopifyGraphQL<{ articles: { nodes: ShopifyArticleSummary[] } }>(
    `query ArticlesByTag($query: String!, $first: Int!) {
      articles(first: $first, query: $query, sortKey: PUBLISHED_AT, reverse: true) {
        nodes { ${ARTICLE_FIELDS} }
      }
    }`,
    { query: `blog_id:${numericId(blog.id)} AND tag:'${tag}'`, first: limit }
  );
  return data.articles.nodes.filter(
    (node) =>
      node.isPublished && node.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
  );
}

export interface CreateArticleInput {
  title: string;
  handle: string;
  bodyHtml: string;
  summary: string;
  tags: string[];
  titleTag: string;
  metaDescription: string;
  imageUrl?: string;
  imageAlt?: string;
}

export async function createArticle(input: CreateArticleInput) {
  const blog = await getBlog();
  const { author } = getBlogConfig();
  const data = await shopifyGraphQL<{
    articleCreate: {
      article: {
        id: string;
        handle: string;
        publishedAt: string | null;
        image: { url: string | null } | null;
      } | null;
      userErrors: Array<{ field?: string[] | null; message: string }>;
    };
  }>(
    `mutation CreateArticle($article: ArticleCreateInput!) {
      articleCreate(article: $article) {
        article { id handle publishedAt image { url } }
        userErrors { code field message }
      }
    }`,
    {
      article: {
        blogId: blog.id,
        title: input.title,
        handle: input.handle,
        body: input.bodyHtml,
        summary: input.summary,
        isPublished: true,
        tags: input.tags,
        author: { name: author },
        ...(input.imageUrl
          ? { image: { url: input.imageUrl, altText: input.imageAlt ?? input.title } }
          : {}),
        metafields: [
          {
            namespace: "global",
            key: "title_tag",
            type: "single_line_text_field",
            value: input.titleTag,
          },
          {
            namespace: "global",
            key: "description_tag",
            type: "single_line_text_field",
            value: input.metaDescription,
          },
        ],
      },
    }
  );
  assertNoUserErrors("articleCreate", data.articleCreate.userErrors);
  if (!data.articleCreate.article) throw new Error("articleCreate returned no article");
  return data.articleCreate.article;
}

export async function updateArticleBody(id: string, bodyHtml: string) {
  const data = await shopifyGraphQL<{
    articleUpdate: {
      article: { id: string } | null;
      userErrors: Array<{ field?: string[] | null; message: string }>;
    };
  }>(
    `mutation UpdateArticle($id: ID!, $article: ArticleUpdateInput!) {
      articleUpdate(id: $id, article: $article) {
        article { id }
        userErrors { code field message }
      }
    }`,
    { id, article: { body: bodyHtml } }
  );
  assertNoUserErrors("articleUpdate", data.articleUpdate.userErrors);
}
