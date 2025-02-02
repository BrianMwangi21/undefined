import getData from "./file";
import { Config, getConfig } from "./config";
import { determineEnum, stringifyEnum, updateAllEnumReferences } from "./enum";
import { makeName } from "./utils";
import { Type } from "./types";

const keyNameToType: Map<string, Type> = new Map();

const keyNameToName: Map<string, string> = new Map();
let count = 0;

function getName(keyName: string, config: Config): string {
    const value = keyNameToName.get(keyName);
    if (value) {
        return value;
    }

    const name = config.nameBase + ++count;
    keyNameToName.set(keyName, name);
    return name;
}

function getKeyName(obj: object): string {
    const keys = Object.keys(obj); // MOST IMPORTANT
    return keys.sort().join("");
}

function isPrimitive(typeofValue: string): boolean {
    return typeofValue === "number" ||
        typeofValue === "string" ||
        typeofValue === "boolean";
}

function insertKeyValue(obj: Type, key: string, value: string | string[]): void {
    let props = obj.properties[key];
    if (!props) {
        props = obj.properties[key] = [];
    }

    if (Array.isArray(value) || !props.includes(value)) {
        props.push(value);
    }
}

function getObj(key: string): Type {
    const value = keyNameToType.get(key);
    if (value) {
        return value;
    }

    const typeObj = {
        unions: [],
        properties: {},
    };
    keyNameToType.set(key, typeObj);

    return typeObj;
}

// this might be a thing?
function handleArray(items: any[], config: Config): (string | string[])[] {
    const out: (string | string[])[] = [];
    for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        const type = typeof item;
        let name: string | string[] = type;

        if (item === null) {
            name = "null";
        } else if (Array.isArray(item)) {
            // @ts-ignore
            name = handleArray(item, config);
        } else if (type === "object") {
            name = typeObject(item, config);
        }

        if (out.indexOf(name) === -1) {
            out.push(name);
        }
    }

    return out;
}

type StringToUnknown = {[key: string]: unknown};
//
function typeObject(obj: StringToUnknown, config: Config): string {
    const keys = Object.keys(obj);
    const keyName = getKeyName(obj);
    const name = getName(keyName, config);
    const typeObj = getObj(keyName);

    for (let i = 0; i < keys.length; ++i) {
        const k = keys[i];
        const value = obj[k];
        const typeOf = typeof value;

        if (isPrimitive(typeOf)) {
            insertKeyValue(typeObj, k, typeOf);
        } else if (value === null) {
            insertKeyValue(typeObj, k, "null");
        } else if (Array.isArray(value)) {
            // @ts-ignore
            // .... how do i ?
            insertKeyValue(typeObj, k, handleArray(value, config));
        } else {
            insertKeyValue(typeObj, k, typeObject(value as StringToUnknown, config));
        }
    }

    return name;
}

function arrayTypeToString(arr: (string | string[])[], current: {[key: string]: boolean} = {}, sub: boolean = false): string {
    const out: string[] = [];
    for (let i = 0; i < arr.length; ++i) {
        const value = arr[i];
        if (Array.isArray(value)) {
            const types = arrayTypeToString(value, current, true);
            if (types) {
                out.push(types);
            }
        } else if (!current[value]) {
            current[value] = true;
            out.push(value);
        }
    }

    if (out.length > 1) {
        return `(${out.join(" | ")})`;
    }

    if (out.length === 1) {
        if (sub) {
            return `${out[0]}[]`;
        }
        return out[0];
    }

    return "";
}

async function run() {
    const config = await getConfig();
    const data = getData<{[key: string]: unknown}>(config.file);

    // TODO: My mother would even be upset
    data.forEach(x => typeObject(x, config));

    for (let i = 0; i < config.enums.length; ++i) {
        const enumItem = config.enums[i];
        const enumKeys = determineEnum(data, enumItem);
        const enumName = makeName(enumItem);

        console.log(stringifyEnum(enumName, enumKeys));
        updateAllEnumReferences(keyNameToType, enumItem, enumName);
    }

    keyNameToType.forEach((v, keyName) => {
        const name = getName(keyName, config);
        console.log(`type ${name} = {`);
        const keys = Object.keys(v.properties);
        for (let i = 0; i < keys.length; ++i) {
            const k = keys[i];
            const types = v.properties[k];

            console.log(`    ${k}: ${arrayTypeToString(types)};`);
        }
        console.log(`}`);
    });
}

run();
