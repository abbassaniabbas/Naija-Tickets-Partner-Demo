import { createIntentKeeper } from "./checkout-intent.js";
const main = document.querySelector("#main");
const paths = {
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  ticket:
    '<path d="M3 6h18v5a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V6Z"/><path d="M15 6v3m0 3v2m0 3v2"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.ticket}</svg>`;
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function staticContent(node, html) {
  node.innerHTML = html;
  return node;
} // Only developer-authored templates/icons. API values use textContent.
function money(kobo) {
  return kobo === null
    ? "—"
    : new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        maximumFractionDigits: kobo % 100 ? 2 : 0,
      }).format(kobo / 100);
}
function date(value, timezone, full = false) {
  try {
    return new Intl.DateTimeFormat("en-NG", {
      timeZone: timezone || "Africa/Lagos",
      day: "numeric",
      month: full ? "long" : "short",
      ...(full ? { year: "numeric", hour: "numeric", minute: "2-digit" } : {}),
    }).format(new Date(value));
  } catch {
    return "Date unavailable";
  }
}
async function api(path, options) {
  const response = await fetch(path, { ...options, cache: "no-store", credentials: "same-origin" });
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error("The website could not read the server response. Please try again.");
  }
  if (!response.ok) throw Error(result.error?.message || "This request could not be completed.");
  return result.data;
}
let bootstrapPromise;
function bootstrap() {
  return (bootstrapPromise ||= api("/api/bootstrap"));
}
function loading(node, label = "Connecting to the sandbox…") {
  const box = el("div", "loading");
  box.setAttribute("role", "status");
  box.append(el("span", "spinner"), el("span", "", label));
  node.replaceChildren(box);
}
function empty(
  node,
  {
    title = "Sandbox events are on their way.",
    message = "Connect the separate Naija Tickets sandbox to load assigned, published events here. No events have been added to this demo by hand.",
    link = true,
  } = {},
) {
  const box = el("div", "empty-state");
  const copy = el("div");
  copy.append(
    el("p", "eyebrow", "A space for your next plan"),
    el("h3", "", title),
    el("p", "", message),
  );
  if (link) {
    const a = el("a", "text-link", "Check the connection ↗");
    a.href = "/integration";
    copy.append(a);
  }
  const art = staticContent(
    el("div", "empty-art"),
    `<div class="mini-ticket">${icon("ticket")}<span class="ticket-lines">LAGOS<br>EVENTS</span></div>`,
  );
  art.setAttribute("aria-hidden", "true");
  box.append(copy, art);
  node.replaceChildren(box);
}
function errorPage(message, title = "This event is unavailable.") {
  main.replaceChildren();
  const wrap = el("section", "wrap events-section");
  empty(wrap, { title, message });
  main.append(wrap);
}
function intro(title, description) {
  const box = el("div", "page-intro");
  const back = el("a", "back-link", "←  Explore events");
  back.href = "/#events";
  box.append(back, el("h1", "", title));
  if (description) box.append(el("p", "", description));
  return box;
}
const toggle = document.querySelector(".menu-toggle"),
  nav = document.querySelector("#main-nav");
function closeMenu() {
  toggle.setAttribute("aria-expanded", "false");
  nav.classList.remove("open");
}
toggle.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") !== "true";
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  nav.classList.toggle("open", open);
});
nav.addEventListener("click", closeMenu);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
    toggle.focus();
  }
});
function connectionPill(monitor) {
  const connected = monitor?.connection === "connected";
  const pill = el("a", `connection-pill ${connected ? "ready" : "pending"}`);
  pill.href = "/integration";
  pill.append(
    el("span", "status-dot"),
    document.createTextNode(connected ? "Sandbox connected" : "Sandbox not connected"),
  );
  return pill;
}
async function home() {
  document.title = "Lagos Events Demo — Make a night of it.";
  main.innerHTML = `
  <section class="hero wrap"><div class="hero-copy"><p class="eyebrow">Your next good night</p><h1>Lagos,<br><em>after hours.</em></h1><p>For the music, the culture, the stories you’ll tell tomorrow. Find your next reason to go out.</p><div class="hero-actions"><a class="button" href="#events">Explore events ${icon("arrow")}</a><a class="text-link" href="#how-it-works">How it works</a></div><p class="hero-footnote">${icon("lock")} Secure ticketing with Naija Tickets · Test mode</p></div><div class="hero-art"><img src="/assets/lagos.webp" alt="Lagos waterfront and city lights at dusk" fetchpriority="high"><span class="image-stamp"><span class="status-dot"></span> LAGOS, NIGERIA</span><span class="orbit">${icon("globe")}</span><div class="photo-caption"><p>Out of the ordinary.<br>Into the city.</p><span>MAKE A NIGHT OF IT.</span></div><span class="photo-corner">↗</span></div></section>
  <div class="ticker wrap" aria-label="Our interests"><span>MUSIC & CULTURE</span><span class="spark" aria-hidden="true">✳</span><span>GOOD PEOPLE. GREAT PLANS.</span><span class="spark" aria-hidden="true">✳</span><span>THE CITY IS YOURS.</span></div>
  <section class="events-section wrap" id="events"><div class="section-heading"><div><p class="eyebrow">On the calendar</p><h2>Find your next plan.</h2></div><div id="connection"></div></div><div class="toolbar"><div class="chips" id="filters" aria-label="Filter event categories"></div><label class="search">${icon("search")}<span class="visually-hidden">Search events</span><input id="search" type="search" placeholder="Find your kind of event" maxlength="120" disabled></label></div><div id="event-list" aria-live="polite"></div><p class="error-message" id="list-error" role="alert"></p><div class="load-more"><button id="load-more" class="button outline" hidden>More events ${icon("arrow")}</button></div></section>
  <section class="how-section wrap" id="how-it-works"><div class="how-heading"><h2 class="section-title">A good plan.<br>Three simple steps.</h2><p>Browse here. Book with Naija Tickets. Keep your ticket close.</p></div><div class="how-grid"><article class="how-item"><span class="step-number">01</span><h3>Find your thing.</h3><p>Explore the organiser’s published sandbox events and choose your tickets.</p></article><article class="how-item"><span class="step-number">02</span><h3>Make it official.</h3><p>Continue to Naija Tickets to enter your details and complete a test payment.</p></article><article class="how-item"><span class="step-number">03</span><h3>Keep your ticket handy.</h3><p>Return for a verified booking update. Your tickets stay with Naija Tickets.</p></article></div></section>
  <section class="banner wrap"><div><h2>A little test. A bigger connection.</h2><p>This fictional organiser uses the Naija Tickets sandbox. Bookings help test the integration and do not provide entry to real events.</p></div><a class="button light" href="/integration">See integration status ${icon("arrow")}</a></section>`;
  const list = document.querySelector("#event-list"),
    filters = document.querySelector("#filters"),
    search = document.querySelector("#search"),
    more = document.querySelector("#load-more");
  let records = [],
    cursor = null,
    category = "",
    busy = false;
  function filterButtons() {
    filters.replaceChildren();
    for (const label of ["", ...new Set(records.map((e) => e.category.name).filter(Boolean))]) {
      const button = el(
        "button",
        "chip" + (label === category ? " selected" : ""),
        label || "All events",
      );
      button.type = "button";
      button.setAttribute("aria-pressed", String(label === category));
      button.addEventListener("click", () => {
        category = label;
        filterButtons();
        render();
      });
      filters.append(button);
    }
  }
  function render() {
    const term = search.value.toLowerCase();
    const selected = records.filter(
      (e) =>
        (!category || e.category.name === category) &&
        `${e.title} ${e.venue.name} ${e.venue.city}`.toLowerCase().includes(term),
    );
    if (!selected.length) {
      empty(list, {
        title: records.length ? "A different kind of plan?" : "No published sandbox events yet.",
        message: records.length
          ? "Try another search or category, or load more events below."
          : "The connection is working. Assign a published event to the sandbox application to see it here.",
        link: !records.length,
      });
      return;
    }
    const grid = el("div", "event-grid");
    for (const event of selected) {
      const a = el("a", "event-card");
      a.href = "/events/" + event.id;
      const cover = el("div", "event-cover");
      const image = el("img");
      image.src = event.image_url || "/assets/lagos.webp";
      image.alt = event.image_url ? event.title : "Lagos cityscape";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.addEventListener(
        "error",
        () => {
          image.src = "/assets/lagos.webp";
        },
        { once: true },
      );
      cover.append(image, el("span", "event-category", event.category.name || "Event"));
      const body = el("div", "event-body");
      body.append(
        el("p", "event-date", date(event.starts_at, event.timezone)),
        el("h3", "", event.title),
        el("p", "event-place", `${event.venue.name} · ${event.venue.city}`),
      );
      const bottom = el("div", "card-bottom");
      bottom.append(el("span", "", "View tickets"), el("span", "", "↗"));
      body.append(bottom);
      a.append(cover, body);
      grid.append(a);
    }
    list.replaceChildren(grid);
  }
  async function load() {
    if (busy) return;
    busy = true;
    more.disabled = true;
    document.querySelector("#list-error").textContent = "";
    if (!records.length) loading(list);
    try {
      const data = await api(
        "/api/events" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
      );
      const ids = new Set(records.map((x) => x.id));
      records.push(...data.events.filter((x) => !ids.has(x.id)));
      cursor = data.next_cursor;
      more.hidden = !cursor;
      search.disabled = !records.length;
      filterButtons();
      render();
    } catch (error) {
      if (records.length) document.querySelector("#list-error").textContent = error.message;
      else empty(list, { message: error.message });
    } finally {
      busy = false;
      more.disabled = false;
    }
  }
  more.addEventListener("click", load);
  search.addEventListener("input", render);
  filterButtons();
  api("/api/status")
    .then((data) => document.querySelector("#connection").replaceChildren(connectionPill(data)))
    .catch(() => document.querySelector("#connection").replaceChildren(connectionPill()));
  await load();
  if (location.hash && ["#events", "#how-it-works"].includes(location.hash))
    document.querySelector(location.hash)?.scrollIntoView();
}
async function detail(id) {
  const wrap = el("section", "wrap");
  main.replaceChildren(wrap);
  loading(wrap, "Loading event and current ticket availability…");
  try {
    const [data, boot, monitor] = await Promise.all([
      api("/api/event?id=" + id),
      bootstrap(),
      api("/api/status"),
    ]);
    const { event, tickets } = data;
    document.title = event.title + " — Lagos Events Demo";
    wrap.replaceChildren(intro(event.title));
    const grid = el("div", "detail-grid"),
      story = el("div"),
      panel = el("section", "booking-panel");
    panel.setAttribute("aria-label", "Choose tickets");
    const image = el("img", "detail-image");
    image.src = event.image_url || "/assets/lagos.webp";
    image.alt = event.image_url ? event.title : "Lagos cityscape";
    image.referrerPolicy = "no-referrer";
    image.addEventListener(
      "error",
      () => {
        image.src = "/assets/lagos.webp";
      },
      { once: true },
    );
    story.append(image);
    const facts = el("div", "event-facts");
    const fact = (name, value, caption) => {
      const row = staticContent(el("div", "fact"), icon(name));
      const copy = el("div", "", value);
      if (caption) copy.append(el("small", "", caption));
      row.append(copy);
      facts.append(row);
    };
    fact(
      "calendar",
      date(event.starts_at, event.timezone, true),
      "Event time in " + event.timezone,
    );
    fact("pin", event.venue.name + ", " + event.venue.city, event.venue.address);
    fact("ticket", "Organised by " + event.organiser.name, "Sandbox event · No real admission");
    story.append(
      facts,
      el("h2", "detail-subtitle", "The plan."),
      el(
        "p",
        "event-description",
        event.description || "More event details are available from the organiser.",
      ),
    );
    panel.append(
      el("h2", "", "Make your plans."),
      el(
        "p",
        "panel-note",
        "Choose your tickets below. Availability is checked again at checkout.",
      ),
    );
    const quantities = new Map(),
      controls = new Map();
    const checkoutAvailable =
      boot.checkout_ready && monitor.checks.find((x) => x.id === "checkout")?.state === "ready";
    const error = el("p", "error-message");
    error.setAttribute("role", "alert");
    const summary = el("div", "cart-summary"),
      estimated = el("strong", "", "Select a ticket");
    summary.append(el("span", "", "Estimated total\nbefore fees"), estimated);
    const admissions = el("p", "admission-label");
    admissions.setAttribute("aria-live", "polite");
    const promo = staticContent(
      el("details", "promo"),
      '<summary>Have a promo code?</summary><label class="visually-hidden" for="promo-code">Promo code</label><input id="promo-code" maxlength="32" autocomplete="off" placeholder="Enter code at checkout">',
    );
    const promoInput = promo.querySelector("input");
    const buy = staticContent(
      el("button", "button full-width"),
      "Continue to checkout " + icon("arrow"),
    );
    buy.type = "button";
    buy.disabled = true;
    let saving = false;
    let storage;
    try {
      storage = sessionStorage;
    } catch {
      /* Use in-memory retry protection. */
    }
    const purchaseIntent = createIntentKeeper({ storage });
    function selected() {
      return [...quantities.entries()]
        .filter(([, n]) => n)
        .map(([ticket_type_id, quantity]) => ({ ticket_type_id, quantity }))
        .sort((a, b) => a.ticket_type_id.localeCompare(b.ticket_type_id));
    }
    function update() {
      let total = 0,
        count = 0;
      for (const ticket of tickets) {
        const qty = quantities.get(ticket.id) || 0;
        total += qty * ticket.price_kobo;
        count += qty * ticket.admissions_per_ticket;
        const c = controls.get(ticket.id);
        c.out.textContent = String(qty);
        c.minus.disabled = saving || !qty;
        c.plus.disabled = saving || qty >= c.max;
      }
      estimated.textContent = count ? money(total) : "Select a ticket";
      admissions.textContent = count
        ? `${count} individual admission${count === 1 ? "" : "s"} selected`
        : "";
      buy.disabled =
        saving || !count || count > 400 || !Number.isSafeInteger(total) || !checkoutAvailable;
      if (count > 400) error.textContent = "Choose no more than 400 admissions per booking.";
    }
    for (const ticket of tickets) {
      quantities.set(ticket.id, 0);
      const option = el("div", "ticket-option"),
        line = el("div", "ticket-line");
      line.append(
        el("h3", "ticket-name", ticket.name),
        el("span", "ticket-price", money(ticket.price_kobo)),
      );
      option.append(line);
      if (ticket.description) option.append(el("p", "ticket-description", ticket.description));
      const meta = el("div", "ticket-meta"),
        label = el(
          "span",
          "",
          ticket.admissions_per_ticket > 1
            ? `Admits ${ticket.admissions_per_ticket} people per package`
            : "Admits 1 person",
        );
      const max = ["open", "allocation_limited"].includes(ticket.sale_status)
        ? Math.min(
            20,
            ticket.max_packages_per_order,
            ticket.remaining_packages,
            ticket.max_packages_at_current_price,
          )
        : 0;
      label.append(
        el("br"),
        document.createTextNode(
          max >= Math.max(1, ticket.min_packages_per_order)
            ? `${ticket.remaining_packages} package${ticket.remaining_packages === 1 ? "" : "s"} available`
            : "Currently unavailable",
        ),
      );
      const quantity = el("div", "quantity"),
        minus = el("button", "", "−"),
        out = el("output", "", "0"),
        plus = el("button", "", "+");
      minus.type = plus.type = "button";
      minus.setAttribute("aria-label", "Remove " + ticket.name);
      plus.setAttribute("aria-label", "Add " + ticket.name);
      out.setAttribute("aria-label", "Quantity of " + ticket.name);
      const min = Math.max(1, ticket.min_packages_per_order);
      const usableMax = max >= min ? max : 0;
      minus.addEventListener("click", () => {
        error.textContent = "";
        const old = quantities.get(ticket.id);
        quantities.set(ticket.id, old <= min ? 0 : old - 1);
        update();
      });
      plus.addEventListener("click", () => {
        error.textContent = "";
        const old = quantities.get(ticket.id);
        quantities.set(ticket.id, Math.min(usableMax, old ? old + 1 : min));
        update();
      });
      controls.set(ticket.id, { minus, plus, out, max: usableMax });
      quantity.append(minus, out, plus);
      meta.append(label, quantity);
      option.append(meta);
      panel.append(option);
    }
    if (!tickets.length)
      panel.append(el("p", "panel-note", "No active ticket types are available for this event."));
    if (tickets.some((t) => t.admissions_per_ticket > 1))
      panel.append(
        el(
          "p",
          "group-note",
          "Group pass? Enter only the buyer’s details at checkout. After payment, each member can claim their own ticket through Naija Tickets.",
        ),
      );
    panel.append(summary, admissions, promo, buy);
    panel.append(
      staticContent(
        el("p", "secure-caption"),
        icon("lock") + "Contact details and test payment are completed securely at Naija Tickets.",
      ),
    );
    if (!checkoutAvailable) {
      const note = el("p", "error-message", "Sandbox checkout is not ready. ");
      const link = el("a", "text-link", "Check integration status.");
      link.href = "/integration";
      note.append(link);
      panel.append(note);
    }
    panel.append(error);
    buy.addEventListener("click", async () => {
      if (saving) return;
      saving = true;
      error.textContent = "";
      buy.textContent = "Preparing your checkout…";
      update();
      try {
        const payload = {
          event_id: event.id,
          items: selected(),
          ...(promoInput.value.trim() ? { promo_code: promoInput.value.trim().toUpperCase() } : {}),
        };
        const intent = purchaseIntent(payload);
        const result = await api("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Demo-CSRF": boot.csrf_token },
          body: JSON.stringify({ ...payload, intent_id: intent }),
        });
        location.assign(result.checkout_url);
      } catch (cause) {
        error.textContent = cause.message;
        saving = false;
        buy.replaceChildren(
          document.createTextNode("Continue to checkout "),
          staticContent(el("span"), icon("arrow")),
        );
        update();
      }
    });
    grid.append(story, panel);
    wrap.append(grid);
    update();
  } catch (error) {
    errorPage(error.message);
  }
}
async function integration() {
  document.title = "Integration status — Lagos Events Demo";
  const wrap = el("section", "wrap");
  wrap.append(
    intro(
      "A connection you can check.",
      "A transparent view of this partner website’s sandbox connection. These checks never start a payment.",
    ),
  );
  const grid = el("div", "status-grid"),
    panel = el("section", "status-panel"),
    aside = el("aside", "status-aside");
  panel.append(
    el("h2", "", "Naija Tickets integration"),
    el(
      "p",
      "muted-message",
      "Checks run through this website’s server. API credentials are never sent to your browser.",
    ),
  );
  const rows = el("div");
  panel.append(rows);
  const foot = el("div", "status-footer"),
    checked = el("span", "", "Not checked yet"),
    refresh = el("button", "button outline", "Check again");
  refresh.type = "button";
  foot.append(checked, refresh);
  panel.append(foot);
  aside.innerHTML =
    '<p class="eyebrow">The test environment</p><h2>Real connection.<br>Test-only bookings.</h2><p>The website loads event information from a separate Naija Tickets sandbox. It has no built-in event listings or payment simulator.</p><ol><li>Connect the isolated sandbox and its Test API key.</li><li>Assign published events and the required permissions.</li><li>Complete a test booking to check payment and ticket issuance.</li></ol><p>Partner webhook delivery is unavailable until Naija Tickets implements outgoing webhooks. The receiver currently rejects every delivery.</p>';
  grid.append(panel, aside);
  wrap.append(grid);
  main.replaceChildren(wrap);
  let busy = false;
  async function check() {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    refresh.textContent = "Checking…";
    try {
      const status = await api("/api/status");
      rows.replaceChildren();
      const names = {
        ready: "Verified",
        blocked: "Needs setup",
        pending: "Pending",
        manual: "Test required",
        unavailable: "Unavailable",
      };
      for (const check of status.checks) {
        const row = el("div", "status-row"),
          copy = el("div");
        copy.append(el("h3", "", check.label), el("p", "", check.detail));
        row.append(
          copy,
          el(
            "span",
            "badge " + check.state,
            check.id === "checkout" && check.state === "ready"
              ? "Available"
              : names[check.state] || "Pending",
          ),
        );
        rows.append(row);
      }
      checked.textContent =
        "Checked " +
        new Date(status.checked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (cause) {
      rows.replaceChildren(el("p", "error-message", cause.message));
    } finally {
      busy = false;
      refresh.disabled = false;
      refresh.textContent = "Check again";
    }
  }
  refresh.addEventListener("click", check);
  await check();
  const timer = setInterval(() => {
    if (!document.hidden) void check();
  }, 60000);
  addEventListener("pagehide", () => clearInterval(timer), { once: true });
}
async function confirmation() {
  document.title = "Booking confirmation — Lagos Events Demo";
  const id = new URLSearchParams(location.search).get("nt_session");
  if (!id || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
    return errorPage(
      "Return here using the link from your Naija Tickets sandbox checkout.",
      "No booking selected.",
    );
  history.replaceState(null, "", "/confirmation?nt_session=" + encodeURIComponent(id)); // Discard the untrusted nt_status browser hint.
  const box = el("section", "confirmation");
  main.replaceChildren(box);
  loading(box, "Verifying your booking with Naija Tickets…");
  let attempts = 0,
    timer,
    stopped = false;
  addEventListener(
    "pagehide",
    () => {
      stopped = true;
      clearTimeout(timer);
    },
    { once: true },
  );
  async function verify() {
    attempts++;
    clearTimeout(timer);
    try {
      const data = await api("/api/confirmation?session=" + encodeURIComponent(id));
      const booking = data.booking;
      const paid = booking.status === "paid";
      const pending = ["open", "pending", "reserved"].includes(booking.status);
      const titles = {
        paid: "Your plans are confirmed.",
        open: "Your booking is waiting.",
        reserved: "Your tickets are reserved.",
        pending: "Checking your payment.",
        failed: "Payment wasn’t completed.",
        expired: "This checkout has expired.",
        cancelled: "Your checkout was cancelled.",
        refunded: "This booking was refunded.",
        partially_refunded: "This booking was partly refunded.",
      };
      const descriptions = {
        paid: "Naija Tickets has verified the payment. Your booking and admission counts below come directly from its server.",
        open: "No completed payment has been recorded for this booking.",
        reserved: "The tickets are held, but a verified payment has not been recorded yet.",
        pending:
          "We have not received a verified paid result yet. Please wait before trying another payment.",
        failed:
          "The ticketing server has not confirmed a successful payment. If money was deducted, contact Naija Tickets before paying again.",
        expired:
          "The reservation is no longer active. If a payment arrived late, Naija Tickets needs to reconcile it before tickets can be issued.",
        cancelled: "The ticketing server confirms that this checkout was cancelled.",
        refunded:
          "This is a refunded booking. A fully refunded ticket does not remain valid for entry.",
        partially_refunded: "Check your current tickets and refund details in Naija Tickets.",
      };
      box.replaceChildren(
        staticContent(el("div", "confirmation-mark"), icon(paid ? "check" : "clock")),
        el("p", "eyebrow", paid ? "Payment verified · Sandbox" : "Sandbox booking update"),
        el("h1", "", titles[booking.status] || "Your booking update."),
        el(
          "p",
          "",
          descriptions[booking.status] || "Review your current booking in Naija Tickets.",
        ),
      );
      const receipt = el("dl", "receipt");
      function row(label, value, cls = "") {
        const r = el("div", "receipt-row " + cls);
        r.append(el("dt", "", label), el("dd", "", value));
        receipt.append(r);
      }
      row("Admissions purchased", String(booking.admissions));
      row("Individual tickets issued", String(booking.tickets_issued));
      if (booking.members_registered)
        row("Group members registered", String(booking.members_registered));
      if (booking.total_kobo !== null) row("Order total", money(booking.total_kobo), "total");
      row("Session ID", booking.id, "receipt-code");
      box.append(receipt);
      if (paid && booking.tickets_issued < booking.admissions)
        box.append(
          el(
            "p",
            "muted-message",
            "Some admissions may be unclaimed group slots. The buyer can manage and share the group invitation from Naija Tickets. Unclaimed slots have no usable QR code.",
          ),
        );
      if (paid)
        box.append(
          el(
            "p",
            "muted-message",
            "Open Naija Tickets to view your account or use your ticket email when available. This partner website does not receive private ticket links or QR codes.",
          ),
        );
      const buttons = el("div", "button-row");
      if (paid || ["refunded", "partially_refunded"].includes(booking.status)) {
        const account = el("a", "button", "Open Naija Tickets");
        account.href = data.account_url;
        buttons.append(account);
      }
      if (pending) {
        const again = el("button", "button outline", "Check payment again");
        again.type = "button";
        again.addEventListener("click", () => {
          attempts = 0;
          void verify();
        });
        buttons.append(again);
      }
      const back = el("a", "button outline", "Explore events");
      back.href = "/#events";
      buttons.append(back);
      box.append(buttons);
      if (pending && attempts < 6 && !stopped) {
        box.append(
          el(
            "p",
            "muted-message",
            "This page will check again shortly. A return from payment is not itself a paid receipt.",
          ),
        );
        timer = setTimeout(() => {
          if (!document.hidden) void verify();
        }, 10000);
      }
    } catch (error) {
      box.replaceChildren(
        el("h1", "", "We couldn’t verify this booking yet."),
        el("p", "", error.message),
      );
      const retry = el("button", "button outline", "Try verification again");
      retry.type = "button";
      retry.addEventListener("click", () => void verify());
      box.append(retry);
    }
  }
  await verify();
}
const path = location.pathname;
if (path === "/integration") void integration();
else if (path === "/confirmation") void confirmation();
else if (/^\/events\/[a-f0-9-]{36}$/i.test(path)) void detail(path.split("/")[2]);
else if (path === "/" || path === "/index.html") void home();
else errorPage("Return to the event list to find your next plan.", "Page not found.");
