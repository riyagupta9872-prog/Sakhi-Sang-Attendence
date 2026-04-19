/* ── Lightweight API wrapper ── */
const API = {
  async request(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, ...data };
    return data;
  },
  get:    (url)        => API.request('GET',    url),
  post:   (url, body)  => API.request('POST',   url, body),
  put:    (url, body)  => API.request('PUT',    url, body),
  delete: (url)        => API.request('DELETE', url),

  async upload(url, formData) {
    const res = await fetch(url, { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, ...data };
    return data;
  }
};
