const API = location.port === "5001" || !location.port ? "/api" : `${location.protocol}//${location.hostname}:5001/api`;
const $ = (id) => document.getElementById(id);

// Account menu in the header.
const accountBtn = $("accountBtn");
const accountMenu = $("accountMenu");
const toggleMenu = (open) => {
  accountMenu.hidden = !open;
  accountBtn.setAttribute("aria-expanded", String(open));
};
accountBtn.addEventListener("click", () => toggleMenu(accountMenu.hidden));
document.addEventListener("click", (event) => { if (!event.target.closest(".account")) toggleMenu(false); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !accountMenu.hidden) { toggleMenu(false); accountBtn.focus(); }
});

// Someone already signed in gets a way back in instead of Log in and Sign up.
fetch(`${API}/auth/session`, { credentials: "include" }).then((r) => r.json()).then(({ data: user }) => {
  if (!user) return;
  const can = (m) => user.isSuperAdmin || user.permissions?.[m]?.includes("read");
  const note = document.createElement("p");
  note.textContent = user.name;
  const link = document.createElement("a");
  link.href = !user.mustChangePassword && can("dashboard") ? "dashboard.html" : "profile.html";
  link.textContent = "Open dashboard";
  accountMenu.replaceChildren(note, link);
}).catch(() => {});

// The page slides away before the login and sign up pages open.
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href="login.html"], a[href="register.html"]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey) return;
  event.preventDefault();
  document.body.classList.add("leaving");
  setTimeout(() => { location.href = link.href; }, 260);
});
addEventListener("pageshow", () => document.body.classList.remove("leaving"));

// Phone menu.
const navToggle = $("menuToggle");
navToggle?.addEventListener("click", () => {
  navToggle.setAttribute("aria-expanded", String($("siteNav").classList.toggle("open")));
});

// Header hairline once the page moves.
const siteHead = document.querySelector(".site-head");
const edge = () => siteHead.classList.toggle("scrolled", scrollY > 8);
addEventListener("scroll", edge, { passive: true });
edge();

// Sections fade up as they enter the screen.
const reveal = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add("in");
    reveal.unobserve(entry.target);
  }
}, { rootMargin: "0px 0px -8% 0px", threshold: .05 });
document.querySelectorAll(".reveal").forEach((el) => reveal.observe(el));
