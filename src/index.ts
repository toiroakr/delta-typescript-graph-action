import getFullGraph from './getFullGraph';
import { outputGraph, output2Graphs } from './graph';
import { info, log } from './utils/log';
import { PullRequestFileInfo } from './utils/github';
import { Graph, Node } from '@ysk8hori/typescript-graph';
import path from 'path';
import { createContext } from './utils/context';

async function makeGraph() {
  const context = createContext();
  // 以下の *_files は src/index.ts のようなパス文字列になっている
  const {
    created,
    deleted,
    modified,
    renamed,
    unchanged: _,
  } = await context.github.getTSFiles();
  log('modified:', modified);
  log('created:', created);
  log('deleted:', deleted);
  log('renamed:', renamed);

  // .tsファイルの変更がある場合のみ Graph を生成する。コンパイル対象外の ts ファイルもあるかもしれないがわからないので気にしない
  if ([modified, created, deleted, renamed].flat().length === 0) {
    await context.github.deleteComment(context.config.commentTitle);
    info('No TypeScript files were changed.');
    return;
  }

  const { fullHeadGraph, fullBaseGraph } = await getFullGraph(context);
  log('fullBaseGraph.nodes.length:', fullBaseGraph.nodes.length);
  log('fullBaseGraph.relations.length:', fullBaseGraph.relations.length);
  log('fullHeadGraph.nodes.length:', fullHeadGraph.nodes.length);
  log('fullHeadGraph.relations.length:', fullHeadGraph.relations.length);

  // head のグラフが空の場合は何もしない
  if (fullHeadGraph.nodes.length === 0) return;

  if (deleted.length !== 0 || hasRenamedFiles(fullHeadGraph, renamed)) {
    // ファイルの削除またはリネームがある場合は Graph を2つ表示する
    await output2Graphs(
      fullBaseGraph,
      // updateNodePathsToRelativeFromCurrentDir(fullBaseGraph),
      fullHeadGraph,
      // updateNodePathsToRelativeFromCurrentDir(fullHeadGraph),
      {
        created: created,
        deleted: deleted,
        modified: modified,
        renamed: renamed,
      },
      context,
    );
  } else {
    await outputGraph(
      fullBaseGraph,
      // updateNodePathsToRelativeFromCurrentDir(fullBaseGraph),
      fullHeadGraph,
      // updateNodePathsToRelativeFromCurrentDir(fullHeadGraph),
      {
        created: created,
        deleted: deleted,
        modified: modified,
        renamed: renamed,
      },
      context,
    );
  }
}

makeGraph().catch(err => {
  info('Error in delta-typescript-graph-action: ', err);
});

function hasRenamedFiles(fullHeadGraph: Graph, renamed: PullRequestFileInfo[]) {
  return fullHeadGraph.nodes.some(headNode =>
    renamed?.map(({ filename }) => filename).includes(headNode.path),
  );
}

function updateNodePathsToRelativeFromCurrentDir(
  graph: Graph,
  /** カレントディレクトリから解析対象の tsconfig のあるディレクトリへの相対パス。`./my-app/` などを想定 */
  rootDir: string,
): Graph {
  function updateNodePath(node: Node): Node {
    return {
      ...node,
      path: path.join(normalizedRootDir, node.path),
    };
  }

  const normalizedRootDir = rootDir.replace(/^.\//, '');
  return {
    ...graph,
    nodes: graph.nodes.map(updateNodePath),
    relations: graph.relations.map(relation => ({
      ...relation,
      from: updateNodePath(relation.from),
      to: updateNodePath(relation.to),
    })),
  };
}
