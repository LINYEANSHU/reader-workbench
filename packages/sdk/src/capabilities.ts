import type {Actor,RunScope} from '../../contracts/src/ids.js';
import type {ModelRequest,ModelEvent,ModelCapabilities} from '../../contracts/src/models.js';
import type {DocumentRecord,VersionedFile,ParsedDocument,ViewerDescriptor,SelectionContext,CaptureRequest,CaptureResult} from '../../contracts/src/documents.js';
import type {ToolDefinition,ActionScope,ActionResult,SelectionActionResult,ProcessToolSpec} from '../../contracts/src/tools.js';
import type {ArtifactInput,ExportedBytes} from '../../contracts/src/artifacts.js';
import type {CommittedTurn,MemorySummary,ContextEnvelope} from '../../contracts/src/sessions.js';
import type {WorkspaceStore} from '../../contracts/src/storage.js';
import type {DirectoryEntry} from '../../contracts/src/workspaces.js';
import type {LifecycleEvent} from '../../contracts/src/runs.js';
import type {UiContribution,LayoutPreset,LayoutNode,HotkeyBinding,HotkeyRegistration} from '../../contracts/src/layout.js';
export interface ModelProvider {capabilities:ModelCapabilities;generate(request:ModelRequest,signal:AbortSignal):AsyncIterable<ModelEvent>}
export interface DocumentAdapter {supports(mime:string,extension:string):boolean;parse(input:VersionedFile,signal:AbortSignal):Promise<ParsedDocument>}
export interface ViewerProvider {describe(document:DocumentRecord):ViewerDescriptor}
export interface ToolProvider {tools:ToolDefinition[]}
export interface ArtifactExporter {export(input:ArtifactInput,scope:RunScope,signal:AbortSignal):Promise<ExportedBytes>}
export interface MemoryProvider {summarize(turns:ReadonlyArray<CommittedTurn>,budget:number,signal:AbortSignal):Promise<MemorySummary>}
export interface ContextTransform {transform(input:Readonly<ContextEnvelope>,signal:AbortSignal):Promise<ContextEnvelope>}
export interface StorageProvider {open(root:string):Promise<WorkspaceStore>}
export interface LifecycleHooks {onEvent(event:LifecycleEvent):Promise<void>}
export interface UIContribution {contributions:UiContribution[];invokeAction(id:string,scope:ActionScope):Promise<ActionResult>}
export interface WorkspaceProvider {browse(path:string,actor:Actor):Promise<DirectoryEntry[]>}
export interface LayoutContribution {presets:LayoutPreset[];apply?(id:string,current:LayoutNode):LayoutNode}
export interface SelectionAction {invoke(selection:SelectionContext,scope:ActionScope):Promise<SelectionActionResult>}
export interface CaptureProvider {platforms:string[];authorization:'browser'|'native';range:'document'|'screen';capture(request:CaptureRequest):Promise<CaptureResult>}
export interface HotkeyProvider {platforms:string[];scope:'page'|'global';register(binding:HotkeyBinding,handler:()=>void):HotkeyRegistration}
export interface ProcessToolProvider {specs:ProcessToolSpec[]}
export interface CapabilityMap {model:ModelProvider;document:DocumentAdapter;viewer:ViewerProvider;tool:ToolProvider;exporter:ArtifactExporter;memory:MemoryProvider;context:ContextTransform;storage:StorageProvider;lifecycle:LifecycleHooks;ui:UIContribution;workspace:WorkspaceProvider;layout:LayoutContribution;selection:SelectionAction;capture:CaptureProvider;hotkey:HotkeyProvider;process:ProcessToolProvider}
