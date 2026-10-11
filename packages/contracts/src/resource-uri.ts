/** Canonical local resource key; preserve valid URI escapes while encoding Unicode and spaces. */
export function resourceUri(value:string):string{return encodeURI(value).replace(/%25([0-9a-f]{2})/gi,'%$1').replace(/%[0-9a-f]{2}/gi,part=>part.toUpperCase());}
