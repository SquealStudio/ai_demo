const TILES = [[350, "M350 338L398.497 365.75V421.25L350 449L301.503 421.25V365.75L350 338Z", "#282828"], [399, "M399 254L447.497 281.75V337.25L399 365L350.503 337.25V281.75L399 254Z", "#282828"], [301, "M301 254L349.497 281.75V337.25L301 365L252.503 337.25V281.75L301 254Z", "#282828"], [203, "M203 254L251.497 281.75V337.25L203 365L154.503 337.25V281.75L203 254Z", "#282828"], [252, "M252 169L300.497 196.75V252.25L252 280L203.503 252.25V196.75L252 169Z", "#282828"], [203, "M203 84L251.497 111.75V167.25L203 195L154.503 167.25V111.75L203 84Z", "#282828"], [105, "M105 84L153.497 111.75V167.25L105 195L56.5026 167.25V111.75L105 84Z", "#282828"], [56, "M56 0L104.497 27.75V83.25L56 111L7.50258 83.25V27.75L56 0Z", "#282828"], [301, "M301 84L349.497 111.75V167.25L301 195L252.503 167.25V111.75L301 84Z", "#282828"], [350, "M350 169L398.497 196.75V252.25L350 280L301.503 252.25V196.75L350 169Z", "#fff"], [252, "M252 338L300.497 365.75V421.25L252 449L203.503 421.25V365.75L252 338Z", "#fff"], [154, "M154 169L202.497 196.75V252.25L154 280L105.503 252.25V196.75L154 169Z", "#fff"], [56, "M56 169L104.497 196.75V252.25L56 280L7.50258 252.25V196.75L56 169Z", "#fff"], [448, "M448 169L496.497 196.75V252.25L448 280L399.503 252.25V196.75L448 169Z", "#fff"], [399, "M399 84L447.497 111.75V167.25L399 195L350.503 167.25V111.75L399 84Z", "#282828"], [448, "M448 0L496.497 27.75V83.25L448 111L399.503 83.25V27.75L448 0Z", "#282828"], [154, "M154 338L202.497 365.75V421.25L154 449L105.503 421.25V365.75L154 338Z", "#282828"], [105, "M105 254L153.497 281.75V337.25L105 365L56.5026 337.25V281.75L105 254Z", "#282828"]];
const avatar = (gen, big) => {
  const d = document.createElement("div");
  d.className = "av" + (gen ? " gen" : "") + (big ? " big" : "");
  d.setAttribute("aria-hidden", "true");
  d.innerHTML = '<svg viewBox="0 0 504 449" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    TILES.map(t => `<path class="tile" style="--x:${t[0]}" d="${t[1]}" fill="${t[2]}"/>`).join("") + "</svg>";
  if (gen) startWave();
  return d;
};
const CYCLE_MS = 1900;
let rev = false, waveTimer = null;
function startWave() {
  clearInterval(waveTimer); rev = false;
  waveTimer = setInterval(() => {
    const els = document.querySelectorAll(".av.gen");
    if (!els.length) { clearInterval(waveTimer); return; }
    rev = !rev;
    els.forEach(a => {
      const tiles = a.querySelectorAll(".tile");
      tiles.forEach(t => { t.style.animation = "none"; });
      a.classList.toggle("rev", rev);
      void a.offsetWidth;
      tiles.forEach(t => { t.style.animation = ""; });
    });
  }, CYCLE_MS);
}
