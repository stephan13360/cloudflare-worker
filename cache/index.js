const BYPASS_COOKIES = ["DW", "ttrss_sid"];

const BYPASS_URI = [];

const BYPASS_QUERY = [];

const CACHE_ON_STATUS = [200, 301, 302, 307, 404];

const TRACKING_QUERY = new RegExp(
  "(gclid|utm_(source|campaign|medium)|fb(cl)?id|fbclid)"
);

addEventListener("fetch", event => {
  try {
    let request = event.request;
    // bypass cache on POST requests
    if (request.method.toUpperCase() === "POST") return;
    // bypass cache specific cookies, urls, or query parameter
    if (checkBypassCache(request)) return;
    return event.respondWith(handleRequest(event));
  } catch (err) {
    return new Response(err.stack || err);
  }
});

async function handleRequest(event) {
  try {
    let request = event.request;
    let cacheUrl = new URL(request.url);
    cacheUrl = await removeCampaignQueries(cacheUrl);
    let cacheRequest = new Request(cacheUrl, request);
    let cache = caches.default;

    // Get response from origin and update the cache
    let originResponse = getOrigin(
      event,
      request,
      cache,
      cacheRequest,
      cacheUrl
    );
    event.waitUntil(originResponse);

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

  deleteKeys.map(k => url.searchParams.delete(k));

  return url;
}

async function getOrigin(event, request, cache, cacheRequest, cacheUrl) {
  try {
    // Get response from orign
    originResponse = await fetch(request);

    // must use Response constructor to inherit all of response's fields
    originResponse = new Response(originResponse.body, originResponse);

    if (CACHE_ON_STATUS.includes(originResponse.status)) {
      // Delete cookie header so HTML can be cached
      originResponse.headers.delete("Set-Cookie");

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

function checkBypassCache(request) {
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

    if (BYPASS_URI.length) {
      let url = new URL(request.url);
      for (let uri of BYPASS_URI) {
        if (url.pathname.includes(uri)) {
          return true;
        }
      }
    }

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
