"""Local-only Cognee 1.6.5 adapter. Stdout is a small source-ID protocol."""
import asyncio
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import traceback

for stream in (sys.stdin, sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")

root = Path(sys.argv[1]).resolve()
root.mkdir(parents=True, exist_ok=True)
cache = Path(os.environ.get("READER_COGNEE_MODEL_CACHE", root / "models")).resolve()
cache.mkdir(parents=True, exist_ok=True)
prepare = "--prepare" in sys.argv[2:]
env_file = root / "worker.env"
env_file.write_text("", encoding="utf-8")
os.environ.update({
    "COGNEE_ENV_FILE": str(env_file), "TELEMETRY_DISABLED": "1",
    "COGNEE_TRACING_ENABLED": "false", "LITELLM_LOCAL_MODEL_COST_MAP": "True",
    "GRAPH_EXTRACTOR": "gliner_demo", "GLINER_AUTO_INSTALL": "false",
    "GLINER_INFERENCE_THREADS": "1", "SUMMARY_METHOD": "from_extraction",
    "IMPROVE_AUTO_ENABLED": "false", "LLM_API_KEY": "", "OPENAI_API_KEY": "",
    "EMBEDDING_API_KEY": "", "EMBEDDING_PROVIDER": "fastembed",
    "EMBEDDING_MODEL": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", "EMBEDDING_DIMENSIONS": "384",
    "HF_HOME": str(cache / "huggingface"), "FASTEMBED_CACHE_PATH": str(cache / "fastembed"),
    "SYSTEM_ROOT_DIRECTORY": str(root / "system"), "DATA_ROOT_DIRECTORY": str(root / "data"),
    "CACHE_ROOT_DIRECTORY": str(root / "cache"), "COGNEE_LOGS_DIR": str(root / "logs"),
    "COGNEE_REPOS_DIR": str(root / "repos"), "LOG_LEVEL": "ERROR",
})
if not prepare:
    os.environ.update({"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"})
os.chdir(root)
protocol = sys.stdout


def emit(request_id, **value):
    protocol.write("RW_COGNEE:" + json.dumps({"id": request_id, **value}, ensure_ascii=False) + "\n")
    protocol.flush()


async def main():
    with contextlib.redirect_stdout(sys.stderr):
        import cognee
        if cognee.__version__ != "1.6.5":
            raise RuntimeError("Cognee version mismatch")
        if os.name == "nt":
            # Ladybug's native file open does not handle Unicode absolute
            # paths. Its subprocess inherits this worker's fixed directory;
            # use an ASCII relative database path inside that SAME directory.
            # This also works when Windows 8.3 aliases retain Chinese letters.
            from cognee.infrastructure.databases.graph.ladybug.adapter import LadybugAdapter
            open_database = LadybugAdapter.create_subprocess

            def local_database(cls, db_path, *args, **kwargs):
                relative = Path(db_path).resolve().relative_to(root)
                if not str(relative).isascii():
                    raise ValueError("Native database path is not ASCII")
                return open_database(str(relative), *args, **kwargs)

            LadybugAdapter.create_subprocess = classmethod(local_database)
        from cognee.api.v1.search import SearchType
        if prepare:
            from cognee.tasks.graph.gliner_demo.extractor import load_extractor
            from fastembed import TextEmbedding
            load_extractor()
            model = TextEmbedding("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", cache_dir=str(cache / "fastembed"))
            list(model.embed(["Local workspace memory 本地工作区记忆"]))
            (cache / "ready.json").write_text(json.dumps({"cognee": "1.6.5", "embedding": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", "extractor": "fastino/gliner2.5-base-v1"}), encoding="utf-8")
            emit(0, result={"ready": True})
            return
    manifest_file = root / "current.json"
    manifest = json.loads(manifest_file.read_text(encoding="utf-8")) if manifest_file.exists() else {"dataset": None, "ids": []}
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            with contextlib.redirect_stdout(sys.stderr):
                if request["method"] == "replace":
                    items = request["payload"]["items"]
                    dataset = "reader_" + hashlib.sha256(json.dumps(items, sort_keys=True).encode()).hexdigest()[:24]
                    if items and dataset != manifest["dataset"]:
                        # Prefixes are source identifiers, not generated citations.
                        await cognee.remember(["RW_SOURCE_" + item["id"] + "\n" + item["text"] for item in items], dataset_name=dataset, self_improvement=False, chunk_size=32768)
                    next_manifest = {"dataset": dataset if items else None, "ids": [item["id"] for item in items]}
                    temporary = manifest_file.with_suffix(".tmp")
                    temporary.write_text(json.dumps(next_manifest), encoding="utf-8")
                    temporary.replace(manifest_file)
                    old = manifest["dataset"]
                    manifest = next_manifest
                    if old and old != manifest["dataset"]:
                        try:
                            await cognee.forget(dataset=old)
                        except Exception:
                            # Old-data cleanup cannot invalidate the new committed
                            # generation. Queries are scoped to its dataset only.
                            pass
                    result = {"indexed": len(items)}
                elif request["method"] == "search":
                    result = []
                    if manifest["dataset"]:
                        responses = []
                        for query_type in [SearchType.GRAPH_COMPLETION, SearchType.CHUNKS]:
                            responses.extend(await cognee.recall(request["payload"]["query"], query_type=query_type, datasets=[manifest["dataset"]], only_context=True, top_k=12, include_references=True))
                        raw = json.dumps(responses, default=lambda value: value.model_dump() if hasattr(value, "model_dump") else str(value), ensure_ascii=False)
                        result = list(dict.fromkeys(item for item in re.findall(r"RW_SOURCE_([a-f0-9]{64})", raw) if item in manifest["ids"]))[:100]
                else:
                    raise ValueError("Unknown operation")
            emit(request["id"], result=result)
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            # No source text, credential or library exception is returned to the app.
            emit(request.get("id", -1) if request else -1, error=type(error).__name__)


if __name__ == "__main__":
    asyncio.run(main())
