import type { BoolType, MetaType } from 'nocodb-sdk';
import type { NcContext } from '~/interface/config';
import View from '~/models/View';
import Noco from '~/Noco';
import NocoCache from '~/cache/NocoCache';
import { extractProps } from '~/helpers/extractProps';
import { replayedViewColumnId } from '~/helpers/viewColumnReplay';
import { deserializeJSON } from '~/utils/serialize';
import { CacheGetType, CacheScope, MetaTable } from '~/utils/globals';

// Community implementation, modelled on CalendarViewColumn.
export default class GanttViewColumn {
  id?: string;
  fk_workspace_id?: string;
  base_id?: string;
  fk_view_id?: string;
  fk_column_id?: string;
  source_id?: string;
  show?: BoolType;
  underline?: BoolType;
  bold?: BoolType;
  italic?: BoolType;
  order?: number;
  group_by?: BoolType;
  group_by_order?: number;
  group_by_sort?: string;
  group_by_enabled?: BoolType;
  aggregation?: string;
  meta?: MetaType;

  constructor(data: GanttViewColumn) {
    Object.assign(this, data);
  }

  public static async get(
    context: NcContext,
    ganttViewColumnId: string,
    ncMeta = Noco.ncMeta,
  ) {
    let viewColumn =
      ganttViewColumnId &&
      (await NocoCache.get(
        context,
        `${CacheScope.GANTT_VIEW_COLUMN}:${ganttViewColumnId}`,
        CacheGetType.TYPE_OBJECT,
      ));
    if (!viewColumn) {
      viewColumn = await ncMeta.metaGet2(
        context.workspace_id,
        context.base_id,
        MetaTable.GANTT_VIEW_COLUMNS,
        ganttViewColumnId,
      );
      if (viewColumn) {
        viewColumn.meta = deserializeJSON(viewColumn.meta);
        await NocoCache.set(
          context,
          `${CacheScope.GANTT_VIEW_COLUMN}:${ganttViewColumnId}`,
          viewColumn,
        );
      }
    }

    return viewColumn && new GanttViewColumn(viewColumn);
  }

  static async insert(
    context: NcContext,
    column: Partial<GanttViewColumn>,
    ncMeta = Noco.ncMeta,
  ) {
    const insertObj = extractProps(column, [
      'fk_view_id',
      'fk_column_id',
      'show',
      'base_id',
      'source_id',
      'underline',
      'bold',
      'italic',
    ]);
    const replayId = replayedViewColumnId(
      insertObj.fk_view_id,
      insertObj.fk_column_id,
    );
    if (replayId) insertObj.id = replayId;

    insertObj.order = await ncMeta.metaGetNextOrder(
      MetaTable.GANTT_VIEW_COLUMNS,
      {
        fk_view_id: insertObj.fk_view_id,
      },
    );

    if (!insertObj.source_id) {
      const viewRef = await View.get(
        context,
        insertObj.fk_view_id,
        false,
        ncMeta,
      );
      insertObj.source_id = viewRef.source_id;
    }

    const { id } = await ncMeta.metaInsert2(
      context.workspace_id,
      context.base_id,
      MetaTable.GANTT_VIEW_COLUMNS,
      insertObj,
    );

    {
      const view = await View.get(context, column.fk_view_id, false, ncMeta);
      if (view) {
        await View.clearSingleQueryCache(
          context,
          view.fk_model_id,
          [view],
          ncMeta,
        );
      }
    }

    return this.get(context, id, ncMeta).then(async (viewColumn) => {
      await NocoCache.appendToList(
        context,
        CacheScope.GANTT_VIEW_COLUMN,
        [column.fk_view_id],
        `${CacheScope.GANTT_VIEW_COLUMN}:${id}`,
      );
      return viewColumn;
    });
  }

  public static async list(
    context: NcContext,
    viewId: string,
    ncMeta = Noco.ncMeta,
  ): Promise<GanttViewColumn[]> {
    const cachedList = await NocoCache.getList(
      context,
      CacheScope.GANTT_VIEW_COLUMN,
      [viewId],
    );
    let { list: viewColumns } = cachedList;
    const { isNoneList } = cachedList;
    if (!isNoneList && !viewColumns.length) {
      viewColumns = await ncMeta.metaList2(
        context.workspace_id,
        context.base_id,
        MetaTable.GANTT_VIEW_COLUMNS,
        {
          condition: {
            fk_view_id: viewId,
          },
          orderBy: {
            order: 'asc',
          },
        },
      );

      for (const viewColumn of viewColumns) {
        viewColumn.meta = deserializeJSON(viewColumn.meta);
      }

      await NocoCache.setList(
        context,
        CacheScope.GANTT_VIEW_COLUMN,
        [viewId],
        viewColumns,
      );
    }
    viewColumns.sort(
      (a, b) =>
        (a.order != null ? a.order : Infinity) -
        (b.order != null ? b.order : Infinity),
    );
    return viewColumns?.map((v) => new GanttViewColumn(v));
  }

  static async update(
    context: NcContext,
    columnId: string,
    body: Partial<GanttViewColumn>,
    ncMeta = Noco.ncMeta,
  ) {
    const updateObj = extractProps(body, [
      'show',
      'order',
      'underline',
      'bold',
      'italic',
    ]);

    const res = await ncMeta.metaUpdate(
      context.workspace_id,
      context.base_id,
      MetaTable.GANTT_VIEW_COLUMNS,
      updateObj,
      columnId,
    );

    await NocoCache.update(
      context,
      `${CacheScope.GANTT_VIEW_COLUMN}:${columnId}`,
      updateObj,
    );

    // on view column update, delete any optimised single query cache
    {
      const viewCol = await this.get(context, columnId, ncMeta);
      if (viewCol?.fk_view_id) {
        const view = await View.get(context, viewCol.fk_view_id, false, ncMeta);
        if (view) {
          await View.clearSingleQueryCache(context, view.fk_model_id, [view]);
        }
      }
    }

    return res;
  }
}
