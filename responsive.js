// ===========================================
// RelayDesk / ESM
// responsive.js
// TOUCH + ORIENTATION DETECTION (for mobile.css)
// ===========================================
// mobile.css originally gated its landscape "compact desktop" layout
// behind the CSS (pointer: coarse) media feature. That's a Media
// Queries Level 4 feature — older WebViews (e.g. the stock browser on
// EMUI 8-era Huawei phones) don't recognize it, and an unrecognized
// media feature makes the whole query evaluate to false, so the
// override silently never applied.
//
// This does the same touch/orientation detection in plain JS instead,
// using capability checks that have worked in every mobile browser
// for over a decade, and just toggles two classes on <html>. mobile.css
// then targets html.is-touch-device.is-landscape instead of the media
// feature. Nothing else on the page depends on this file.

(function () {

    function isTouchDevice() {
        return ('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0) ||
            (navigator.msMaxTouchPoints > 0);
    }

    function update() {
        var root = document.documentElement;

        root.classList.toggle('is-touch-device', isTouchDevice());
        root.classList.toggle('is-landscape', window.innerWidth > window.innerHeight);

        var viewport = document.querySelector('meta[name="viewport"]');
        if (viewport && isTouchDevice()) {
            if (window.innerWidth > window.innerHeight) {
                viewport.setAttribute('content', 'width=1150, initial-scale=0.4');
            } else {
                viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
            }
        }
    }

    update();

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

})();
