import type { BoolType, GanttType, MetaType } from 'nocodb-sdk';
import type { NcContext } from '~/interface/config';
import { extractProps } from '~/helpers/extractProps';
import { prepareForDb, prepareForResponse } from '~/utils/modelUtils';
import NocoCache from '~/cache/NocoCache';
import Noco from '~/Noco';
import { CacheGetType, CacheScope, MetaTable } from '~/utils/globals';

// Community implementation, modelled on CalendarView.
// The view-owned DateDependency rule is not loaded here; start/end columns
// are kept in `meta` (see GanttMetaType in nocodb-sdk) for the community build.
export default class GanttView implements GanttType {
  fk_view_id: string;
  title: string;
  fk_workspace_id?: string;
  base_id?: string;
  source_id?: string;
  meta?: MetaType;
  show?: BoolType;
  public?: BoolType;
  password?: string;
  show_all_fields?: BoolType;

  constructor(data: GanttView) {
    Object.assign(this, data);
  }

  public static async get(
    context: NcContext,
    viewId: string,
    ncMeta = Noco.ncMeta,
  ) {
    let view =
      viewId &&
      (await NocoCache.get(
        context,
        `${CacheScope.GANTT_VIEW}:${viewId}`,
        CacheGetType.TYPE_OBJECT,
      ));

    if (!view) {
      view = await ncMeta.metaGet2(
        context.workspace_id,
        context.base_id,
        MetaTable.GANTT_VIEW,
        {
          fk_view_id: viewId,
        },
      );
      if (view) {
        view.meta =
          view.meta && typeof view.meta === 'string'
            ? JSON.parse(view.meta)
            : view.meta;
        await NocoCache.set(context, `${CacheScope.GANTT_VIEW}:${viewId}`, view);
      }
    }

    return view && new GanttView(view);
  }

  static async insert(
    context: NcContext,
    view: Partial<GanttView>,
    ncMeta = Noco.ncMeta,
  ) {
    const insertObj = {
      base_id: view.base_id,
      source_id: view.source_id,
      fk_view_id: view.fk_view_id,
      title: view.title,
      meta: view.meta,
    };

    await ncMeta.metaInsert2(
      context.workspace_id,
      context.base_id,
      MetaTable.GANTT_VIEW,
      prepareForDb(insertObj),
      true,
    );

    return this.get(context, view.fk_view_id, ncMeta);
  }

  static async update(
    context: NcContext,
    ganttId: string,
    body: Partial<GanttView>,
    ncMeta = Noco.ncMeta,
  ) {
    const updateObj = extractProps(body, ['meta']);

    const res = await ncMeta.metaUpdate(
      context.workspace_id,
      context.base_id,
      MetaTable.GANTT_VIEW,
      prepareForDb(updateObj),
      {
        fk_view_id: ganttId,
      },
    );

    await NocoCache.update(
      context,
      `${CacheScope.GANTT_VIEW}:${ganttId}`,
      prepareForResponse(updateObj),
    );

    return res;
  }
}
