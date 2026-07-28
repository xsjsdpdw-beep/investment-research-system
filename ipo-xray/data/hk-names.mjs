const DISPLAY_OVERRIDES = Object.freeze({
  "02228": "晶泰控股有限公司",
  "02629": "觅瑞集团控股有限公司",
  "02605": "元光科技",
  "06603": "爱福比控股有限公司",
  "03887": "哈希键控股有限公司",
  "00100": "稀宇科技集团",
  "00068": "群核科技",
  "06228": "自由黄金资源有限公司",
  "06880": "梦腾智驾环球有限公司",
  "02505": "易达云集团控股有限公司",
});

function stripShareClass(name) {
  let value = String(name || "").trim();
  const suffix = /\s*[-－]\s*(?:H\s*shares?|H\s*股|B\s*shares?|B\s*股|B|W\s*shares?|W\s*股|W|P|DRS)\s*$/i;
  while (suffix.test(value)) value = value.replace(suffix, "").trim();
  return value;
}

export function displayHkName(code, name) {
  const normalizedCode = String(code || "").padStart(5, "0");
  return DISPLAY_OVERRIDES[normalizedCode] || stripShareClass(name) || "待核验港股项目";
}
