const BYPASS_COOKIES = ["no_worker_cache=true", "ghost-admin-api-session"];

const BYPASS_PATH = ["/ghost/"];

const BYPASS_QUERY = [];

const CACHE_ON_STATUS = [200, 301, 302, 303, 307, 404];

const TRACKING_QUERY = new RegExp(
  "(gclid|utm_(source|campaign|medium)|fb(cl)?id|fbclid)"
);

addEventListener("fetch", (event) => {
  try {
    let request = event.request;
    // bypass cache on POST requests
    if (request.method.toUpperCase() === "POST") return;
    // bypass cache on specific cookies, url paths, or query parameters
    if (checkBypassCookie(request)) return;
    if (checkBypassPath(request)) return;
    if (checkBypassQuery(request)) return;
    return event.respondWith(handleRequest(event));
  } catch (err) {
    return new Response(err.stack || err);
  }
});

async function handleRequest(event) {
  try {
    let request = event.request;
    let cacheUrl = new URL(request.url);
    // remove tracking query parameters to increase cache hit ratio
    cacheUrl = await removeCampaignQueries(cacheUrl);
    let cacheRequest = new Request(cacheUrl, request);
    let cache = caches.default;

    // Get response from origin and update the cache
    let originResponse = getOrigin(event, request, cache, cacheRequest);
    // don't stop the worker before the origin request finishes and is cached
    event.waitUntil(originResponse);

    // check if url is already cached
    let response = await cache.match(cacheRequest);
    // Use cache response when available, otherwise use origin response
    if (!response) response = await originResponse;
    return response;
  } catch (err) {
    return new Response(err.stack || err);
  }
}

async function removeCampaignQueries(url) {
  let deleteKeys = [];

  for (var key of url.searchParams.keys()) {
    if (key.match(TRACKING_QUERY)) {
      deleteKeys.push(key);
    }
  }

  deleteKeys.forEach((k) => url.searchParams.delete(k));

  return url;
}

async function getOrigin(event, request, cache, cacheRequest) {
  try {
    // Get response from orign
    let originResponse = await fetch(request);

    // use normal cloudflare cache for non html files
    if (!originResponse.headers?.get("Content-Type")?.includes("text/html"))
      return originResponse;

    // must use Response constructor to inherit all of response's fields
    originResponse = new Response(originResponse.body, originResponse);

    if (CACHE_ON_STATUS.includes(originResponse.status)) {
      // Delete cookie header so HTML can be cached
      originResponse.headers.delete("Set-Cookie");

      // Overwrite Cache-Control header so HTML can be cached
      originResponse.headers.set(
        "Cache-Control",
        "public, s-maxage=604800, max-age=0"
      );

      // waitUntil runs even after response has been sent
      event.waitUntil(cache.put(cacheRequest, originResponse.clone()));

      return originResponse;
    } else {
      return originResponse;
    }
  } catch (err) {
    return new Response(err.stack || err);
  }
}

function checkBypassCookie(request) {
  try {
    if (BYPASS_COOKIES.length) {
      const cookieHeader = request.headers.get("cookie");
      if (cookieHeader && cookieHeader.length) {
        const cookies = cookieHeader.split(";");
        for (let cookie of cookies) {
          for (let bypassCookie of BYPASS_COOKIES) {
            if (cookie.trim().startsWith(bypassCookie)) {
              return true;
            }
          }
        }
      }
    }

    return false;
  } catch (err) {
    return new Response(err.stack || err);
  }
}

function checkBypassPath(request) {
  try {
    if (BYPASS_PATH.length) {
      let url = new URL(request.url);
      for (let uri of BYPASS_PATH) {
        if (url.pathname.includes(uri)) {
          return true;
        }
      }
    }

    return false;
  } catch (err) {
    return new Response(err.stack || err);
  }
}

function checkBypassQuery(request) {
  try {
    if (BYPASS_QUERY.length) {
      let url = new URL(request.url);
      for (let query of BYPASS_QUERY) {
        if (url.search.includes(query)) {
          return true;
        }
      }
    }

    return false;
  } catch (err) {
    return new Response(err.stack || err);
  }
}
