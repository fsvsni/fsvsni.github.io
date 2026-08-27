/* 主页站内搜索：读取 head 中注入的 JSON，实时过滤标题/分类 */
(function () {
    var dataEl = document.getElementById("blog-posts-json");
    var input = document.getElementById("project-search-input");
    var box = document.getElementById("project-search-results");
    if (!dataEl || !input || !box) return;
    var POSTS;
    try {
        POSTS = JSON.parse(dataEl.textContent);
    } catch (e) {
        return;
    }
    if (!Array.isArray(POSTS)) return;

    function norm(s) {
        return String(s).toLowerCase().replace(/\s+/g, "");
    }
    function esc(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    input.addEventListener("input", function () {
        var kw = norm(input.value);
        if (!kw) {
            box.innerHTML = "";
            box.style.display = "none";
            return;
        }
        var hits = POSTS.filter(function (p) {
            return norm(p.title).indexOf(kw) !== -1 || norm(p.cat).indexOf(kw) !== -1;
        });
        if (!hits.length) {
            box.innerHTML = '<div class="ps-empty">没有匹配的笔记，换个关键词试试</div>';
        } else {
            box.innerHTML = hits.slice(0, 15)
                .map(function (p) {
                    var cat = p.cat ? '<span class="ps-cat">' + esc(p.cat) + "</span>" : "";
                    var date = p.date ? '<span class="ps-date">' + esc(p.date) + "</span>" : "";
                    return (
                        '<a class="ps-item" href="' +
                        esc(p.url) +
                        '"><span class="ps-title">' +
                        esc(p.title) +
                        "</span>" +
                        cat +
                        date +
                        "</a>"
                    );
                })
                .join("");
        }
        box.style.display = "block";
    });
})();
