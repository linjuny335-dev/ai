/* ============================================================================
 *  CentralGeometry —— 按主题选择中心几何体
 * ----------------------------------------------------------------------------
 *  加几何体请改 src/geometry/index.ts，不用动这个文件。
 * ========================================================================== */

import { DEFAULT_GEOMETRY, GEOMETRIES } from '../geometry'
import type { GeometryId } from '../config/themes'

export interface CentralGeometryProps {
  id: GeometryId | string
}

export default function CentralGeometry({ id }: CentralGeometryProps) {
  const Impl = GEOMETRIES[id] ?? GEOMETRIES[DEFAULT_GEOMETRY]
  return <Impl />
}
