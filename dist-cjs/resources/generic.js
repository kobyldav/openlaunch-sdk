"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenericResource = void 0;
const utils_js_1 = require("../utils.js");
const errors_js_1 = require("../errors.js");
const base_js_1 = require("./base.js");
function mapper(raw) {
    const entityId = (0, utils_js_1.id)((0, utils_js_1.get)(raw, "id"));
    const name = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "name"));
    if (entityId === undefined || !name)
        throw new errors_js_1.ParseError("Generic entity requires id and name", raw);
    const out = { id: entityId, name, source: { provider: "launch-library-2", id: entityId } };
    const url = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "url"));
    if (url)
        out.source.url = url;
    const description = (0, utils_js_1.str)((0, utils_js_1.get)(raw, "description"));
    if (description)
        out.description = description;
    const image = (0, utils_js_1.imageFrom)((0, utils_js_1.get)(raw, "image"));
    if (image)
        out.image = image;
    return out;
}
class GenericResource extends base_js_1.BaseResource {
    constructor(http, endpoint) { super(http, endpoint); }
    map = mapper;
}
exports.GenericResource = GenericResource;
//# sourceMappingURL=generic.js.map