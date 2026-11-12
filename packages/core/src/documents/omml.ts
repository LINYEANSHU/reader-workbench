import {XMLParser} from 'fast-xml-parser';
// Office Math (OMML, as stored in .docx/.pptx) to LaTeX. Formulas are structured in the source file, so this is exact,
// whereas text extracted from a rendered PDF scatters their glyphs.
export type XmlNode=Record<string,unknown>;
const parser=new XMLParser({ignoreAttributes:false,preserveOrder:true,processEntities:false,parseTagValue:false,parseAttributeValue:false,trimValues:false});
export function parseOrderedXml(xml:string):XmlNode[]{return parser.parse(xml) as XmlNode[];}
export function tagOf(node:XmlNode):string|undefined{return Object.keys(node).find(key=>key!==':@');}
export function childrenOf(node:XmlNode):XmlNode[]{const tag=tagOf(node);const value=tag?node[tag]:undefined;return Array.isArray(value)?value as XmlNode[]:[];}
export function attribute(node:XmlNode,name:string):string|undefined{const value=(node[':@'] as Record<string,unknown>|undefined)?.['@_'+name];return value===undefined?undefined:String(value);}
export function child(node:XmlNode,tag:string):XmlNode|undefined{return childrenOf(node).find(item=>tagOf(item)===tag);}
const entities:Record<string,string>={lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"};
export function decodeXmlText(value:string):string{return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(whole,name:string)=>name[0]==='#'?String.fromCodePoint(Number.parseInt(name.slice(name[1]==='x'||name[1]==='X'?2:1),name[1]==='x'||name[1]==='X'?16:10)):entities[name]??whole);}
/** Concatenated text of all #text descendants. */
export function textContent(node:XmlNode):string{if('#text' in node)return decodeXmlText(String(node['#text']));return childrenOf(node).map(textContent).join('');}
const symbols:Record<string,string>={'∑':'\\sum ','∏':'\\prod ','∐':'\\coprod ','∫':'\\int ','∬':'\\iint ','∭':'\\iiint ','∮':'\\oint ','⋃':'\\bigcup ','⋂':'\\bigcap ','≤':'\\le ','≥':'\\ge ','≠':'\\ne ','±':'\\pm ','∓':'\\mp ','×':'\\times ','÷':'\\div ','∞':'\\infty ','→':'\\to ','←':'\\leftarrow ','⇒':'\\Rightarrow ','⇔':'\\Leftrightarrow ','↔':'\\leftrightarrow ','·':'\\cdot ','⋅':'\\cdot ','∈':'\\in ','∉':'\\notin ','⊂':'\\subset ','⊆':'\\subseteq ','⊃':'\\supset ','⊇':'\\supseteq ','∪':'\\cup ','∩':'\\cap ','∂':'\\partial ','∇':'\\nabla ','≈':'\\approx ','≡':'\\equiv ','∝':'\\propto ','∀':'\\forall ','∃':'\\exists ','¬':'\\neg ','∧':'\\wedge ','∨':'\\vee ','…':'\\ldots ','⋯':'\\cdots ','∠':'\\angle ','°':'^{\\circ}','′':"'",'∅':'\\emptyset ','ℝ':'\\mathbb{R}','ℕ':'\\mathbb{N}','ℤ':'\\mathbb{Z}','ℚ':'\\mathbb{Q}','ℂ':'\\mathbb{C}',
 'α':'\\alpha ','β':'\\beta ','γ':'\\gamma ','δ':'\\delta ','ε':'\\varepsilon ','ϵ':'\\epsilon ','ζ':'\\zeta ','η':'\\eta ','θ':'\\theta ','ϑ':'\\vartheta ','ι':'\\iota ','κ':'\\kappa ','λ':'\\lambda ','μ':'\\mu ','ν':'\\nu ','ξ':'\\xi ','π':'\\pi ','ρ':'\\rho ','σ':'\\sigma ','ς':'\\varsigma ','τ':'\\tau ','υ':'\\upsilon ','φ':'\\varphi ','ϕ':'\\phi ','χ':'\\chi ','ψ':'\\psi ','ω':'\\omega ','Γ':'\\Gamma ','Δ':'\\Delta ','Θ':'\\Theta ','Λ':'\\Lambda ','Ξ':'\\Xi ','Π':'\\Pi ','Σ':'\\Sigma ','Φ':'\\Phi ','Ψ':'\\Psi ','Ω':'\\Omega '};
const escapes:Record<string,string>={'\\':'\\backslash ','{':'\\{','}':'\\}','#':'\\#','%':'\\%','&':'\\&','$':'\\$','_':'\\_','^':'\\^{}','~':'\\sim '};
function latexText(text:string):string{let output='';for(const character of text)output+=symbols[character]??escapes[character]??character;return output;}
const accents:Record<string,string>={'\u0302':'\\hat','\u0303':'\\tilde','\u0304':'\\bar','\u0305':'\\bar','\u0307':'\\dot','\u0308':'\\ddot','\u20d7':'\\vec','\u030c':'\\check','\u0301':'\\acute','\u0300':'\\grave','\u0306':'\\breve'};
const functions=/^(?:sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|coth|arcsin|arccos|arctan|log|ln|lg|exp|lim|max|min|sup|inf|det|arg|deg|dim|gcd|ker|hom|Pr)$/;
const delimiters:Record<string,string>={'(':'(',')':')','[':'[',']':']','{':'\\{','}':'\\}','|':'|','‖':'\\|','⟨':'\\langle','⟩':'\\rangle','⌊':'\\lfloor','⌋':'\\rfloor','⌈':'\\lceil','⌉':'\\rceil','':'.'};
const property=(node:XmlNode,propertyTag:string,tag:string)=>{const properties=child(node,propertyTag);const value=properties&&child(properties,tag);return value?attribute(value,'m:val')??'':undefined;};
const group=(value:string)=>'{'+value.trim()+'}';
/** Converts an m:oMath / m:oMathPara node (or any math descendant) to LaTeX without $ delimiters. */
export function ommlToLatex(node:XmlNode):string{
 const tag=tagOf(node);if(!tag)return '#text' in node?latexText(textContent(node)):'';
 const part=(name:string)=>{const found=child(node,name);return found?ommlToLatex(found):'';},all=()=>childrenOf(node).map(ommlToLatex).join('');
 switch(tag){
  case 'm:oMathPara':return childrenOf(node).filter(item=>tagOf(item)==='m:oMath').map(ommlToLatex).join(' \\\\ ');
  case 'm:r':{const text=childrenOf(node).filter(item=>tagOf(item)==='m:t').map(textContent).join('');const plain=child(node,'m:rPr')&&child(child(node,'m:rPr')!,'m:nor');return plain?'\\text{'+text.replace(/[\\{}]/g,character=>escapes[character]!)+'}':latexText(text);}
  case 'm:t':return latexText(textContent(node));
  case 'm:f':{const type=property(node,'m:fPr','m:type'),num=part('m:num'),den=part('m:den');return type==='lin'?group(num)+'/'+group(den):type==='noBar'?'\\genfrac{}{}{0pt}{}'+group(num)+group(den):'\\frac'+group(num)+group(den);}
  case 'm:sSup':return group(part('m:e'))+'^'+group(part('m:sup'));
  case 'm:sSub':return group(part('m:e'))+'_'+group(part('m:sub'));
  case 'm:sSubSup':return group(part('m:e'))+'_'+group(part('m:sub'))+'^'+group(part('m:sup'));
  case 'm:sPre':return '{}_'+group(part('m:sub'))+'^'+group(part('m:sup'))+group(part('m:e'));
  case 'm:rad':{const hidden=property(node,'m:radPr','m:degHide'),degree=part('m:deg').trim();return '\\sqrt'+(degree&&!['1','on','true'].includes(hidden??'')?'['+degree+']':'')+group(part('m:e'));}
  case 'm:nary':{const character=property(node,'m:naryPr','m:chr'),operator=(symbols[character||'∫']??latexText(character||'∫')).trim(),sub=property(node,'m:naryPr','m:subHide'),sup=property(node,'m:naryPr','m:supHide'),hidden=(value:string|undefined)=>['1','on','true'].includes(value??'');
   return operator+(hidden(sub)?'':'_'+group(part('m:sub')))+(hidden(sup)?'':'^'+group(part('m:sup')))+' '+group(part('m:e'));}
  case 'm:d':{const begin=property(node,'m:dPr','m:begChr'),end=property(node,'m:dPr','m:endChr'),separator=property(node,'m:dPr','m:sepChr'),items=childrenOf(node).filter(item=>tagOf(item)==='m:e').map(ommlToLatex),open=begin??'(',close=end??')',sep=separator??'|';
   return '\\left'+(delimiters[open]??latexText(open))+items.join(sep==='|'?' \\mid ':latexText(sep))+'\\right'+(delimiters[close]??latexText(close));}
  case 'm:m':return '\\begin{matrix}'+childrenOf(node).filter(item=>tagOf(item)==='m:mr').map(row=>childrenOf(row).filter(item=>tagOf(item)==='m:e').map(ommlToLatex).join(' & ')).join(' \\\\ ')+'\\end{matrix}';
  case 'm:eqArr':return '\\begin{aligned}'+childrenOf(node).filter(item=>tagOf(item)==='m:e').map(ommlToLatex).join(' \\\\ ')+'\\end{aligned}';
  case 'm:acc':{const character=property(node,'m:accPr','m:chr')??'\u0302';return (accents[character]??'\\hat')+group(part('m:e'));}
  case 'm:bar':return (property(node,'m:barPr','m:pos')==='top'?'\\overline':'\\underline')+group(part('m:e'));
  case 'm:groupChr':{const position=property(node,'m:groupChrPr','m:pos');return (position==='top'?'\\overbrace':'\\underbrace')+group(part('m:e'));}
  case 'm:borderBox':return '\\boxed'+group(part('m:e'));
  case 'm:func':{const name=part('m:fName').trim();return (functions.test(name)?'\\'+name:/^\\/.test(name)?name:'\\operatorname'+group(name))+' '+group(part('m:e'));}
  case 'm:limLow':{const base=part('m:e').trim(),limit=part('m:lim');return functions.test(base)?'\\'+base+'_'+group(limit):'\\underset'+group(limit)+group(base);}
  case 'm:limUpp':return '\\overset'+group(part('m:lim'))+group(part('m:e'));
  default:return tag.endsWith('Pr')?'':all();
 }
}
/** context: its paragraph's text without formulas; before: the nearest earlier paragraph that has text. */
export interface ExtractedFormula {latex:string;display:boolean;context:string;before:string}
const isMath=(tag?:string)=>tag==='m:oMath'||tag==='m:oMathPara';
function plainText(node:XmlNode):string{const tag=tagOf(node);if(isMath(tag))return ' ';if(tag==='a:t'||tag==='w:t')return textContent(node);if(tag==='w:tab')return ' ';return childrenOf(node).map(plainText).join('');}
/** Every formula in an Office XML part, in reading order, with paragraph text (w:p or a:p) that locates it on a rendered page. */
export function extractFormulas(xml:string):ExtractedFormula[]{
 const output:ExtractedFormula[]=[];let previous='',context='',before='';
 const visit=(node:XmlNode,inParagraph:boolean)=>{const tag=tagOf(node);
  if(isMath(tag)){const latex=ommlToLatex(node).trim();if(latex)output.push({latex,display:tag==='m:oMathPara'||inParagraph&&!context,context,before});return;}
  if(tag==='w:p'||tag==='a:p'){const saved=[context,before];context=plainText(node).replace(/\s+/g,' ').trim();before=previous;for(const item of childrenOf(node))visit(item,true);if(context)previous=context;[context,before]=saved as [string,string];return;}
  for(const item of childrenOf(node))visit(item,inParagraph);};
 for(const node of parseOrderedXml(xml))visit(node,false);
 return output;
}
