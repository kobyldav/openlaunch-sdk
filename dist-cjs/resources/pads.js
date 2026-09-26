"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PadsResource = void 0;
const mappers_js_1 = require("../mappers.js");
const base_js_1 = require("./base.js");
class PadsResource extends base_js_1.BaseResource {
    constructor(http) { super(http, "pads"); }
    map = mappers_js_1.mapPad;
}
exports.PadsResource = PadsResource;
//# sourceMappingURL=pads.js.map