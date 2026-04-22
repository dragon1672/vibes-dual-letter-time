
import * as THREE from 'three';
import { SupportType } from '../../types';

// Helper to sanitize points for Manifold
export const cleanPoints = (points: number[][]): number[][] => {
    if (points.length < 3) return [];
    
    const result: number[][] = [];
    let last = points[points.length - 1];
    
    for (let i = 0; i < points.length; i++) {
        const curr = points[i];
        const dx = curr[0] - last[0];
        const dy = curr[1] - last[1];
        // Filter out extremely small segments
        if (dx * dx + dy * dy > 0.000001) {
            result.push(curr);
            last = curr;
        }
    }
    
    return result.length >= 3 ? result : [];
};

// Ensure points are in correct winding order (CCW for shape, CW for holes)
export const isCCW = (points: number[][]) => {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        sum += (p2[0] - p1[0]) * (p2[1] + p1[1]);
    }
    return sum < 0; 
};

export const processPoints = (points: number[][], desiredCCW: boolean): number[][] => {
    const ccw = isCCW(points);
    if (ccw !== desiredCCW) {
        return points.reverse();
    }
    return points;
};

// Helper to convert THREE.Shape[] to Manifold
export const shapesToManifold = (shapes: THREE.Shape[], m: any, depth: number) => {
    const loops: number[][][] = [];
    const resolution = 16; 

    shapes.forEach(shape => {
        const points = shape.getPoints(resolution).map(p => [p.x, p.y]);
        if (points.length > 0) {
            const first = points[0];
            const last = points[points.length - 1];
            if (Math.abs(first[0] - last[0]) < 0.0001 && Math.abs(first[1] - last[1]) < 0.0001) {
                points.pop();
            }
        }
        const cleaned = cleanPoints(points);
        if (cleaned.length >= 3) {
            loops.push(processPoints(cleaned, true));
        }

        shape.holes.forEach(hole => {
            const holePoints = hole.getPoints(resolution).map(p => [p.x, p.y]);
            if (holePoints.length > 0) {
                const first = holePoints[0];
                const last = holePoints[holePoints.length - 1];
                if (Math.abs(first[0] - last[0]) < 0.0001 && Math.abs(first[1] - last[1]) < 0.0001) {
                    holePoints.pop();
                }
            }
            const cleanedHole = cleanPoints(holePoints);
            if (cleanedHole.length >= 3) {
                loops.push(processPoints(cleanedHole, false));
            }
        });
    });

    if (loops.length === 0) return null;

    let cs = null;
    try {
        const fillRule = m.FillRule ? m.FillRule.EvenOdd : 'EvenOdd'; 
        cs = new m.CrossSection(loops, fillRule);
        
        let manifold = null;
        if (m.Manifold && typeof m.Manifold.extrude === 'function') {
            manifold = m.Manifold.extrude(cs, depth);
        } else if (cs && typeof cs.extrude === 'function') {
            manifold = cs.extrude(depth);
        } else if (typeof m.extrude === 'function') {
            manifold = m.extrude(cs, depth);
        } else {
            throw new Error("Extrude function not found in Manifold API");
        }
        return manifold;
    } catch (e: any) {
        console.error("Manifold conversion/extrusion failed:", e);
        return null;
    } finally {
        if (cs && typeof cs.delete === 'function') {
            cs.delete();
        }
    }
};

export const createSupportPrimitive = (m: any, type: SupportType, height: number, size: number) => {
    try {
        if (type === 'CYLINDER') {
            if (m.Manifold && typeof m.Manifold.cylinder === 'function') {
                return m.Manifold.cylinder(height, size, size, 16, true);
            } else if (typeof m.cylinder === 'function') {
                return m.cylinder(height, size, size, 16, true);
            }
        } else if (type === 'SQUARE') {
            if (m.Manifold && typeof m.Manifold.cube === 'function') {
                return m.Manifold.cube([size * 2, size * 2, height], true);
            } else if (typeof m.cube === 'function') {
                return m.cube([size * 2, size * 2, height], true);
            }
        }
    } catch (e) {
        console.warn("Primitive creation failed", e);
    }
    return null;
};

// Auto-bridge logic: Decomposes manifold, finds vertically separated parts, and connects them.
export const applyAutoBridge = (inputManifold: any, m: any) => {
    const componentsVec = inputManifold.decompose();
    const isArray = Array.isArray(componentsVec);
    const count = isArray ? componentsVec.length : componentsVec.size();
    
    if (count <= 1) {
        if (!isArray && componentsVec.delete) componentsVec.delete();
        return inputManifold;
    }
    
    const parts: any[] = [];
    for(let i=0; i<count; i++) {
        parts.push(isArray ? componentsVec[i] : componentsVec.get(i));
    }
    if (!isArray && componentsVec.delete) componentsVec.delete();
    
    // Sort by Y position (bottom to top)
    parts.sort((a, b) => {
        const bA = a.boundingBox();
        const bB = b.boundingBox();
        return bA.min[1] - bB.min[1];
    });

    const bridgeGeoms = [];
    
    for(let i=0; i < parts.length - 1; i++) {
        const lower = parts[i];
        const upper = parts[i+1];
        
        const bLower = lower.boundingBox();
        const bUpper = upper.boundingBox();
        
        // Check for vertical gap
        const yMin = bLower.max[1];
        const yMax = bUpper.min[1];
        
        // If there is a gap or they are just touching, bridge them
        if (yMax > yMin - 0.2) { 
            const height = (yMax - yMin) + 0.4; // Small overlap
            const centerY = (yMax + yMin) / 2;
            
            // X/Z Centers
            const cLx = (bLower.min[0] + bLower.max[0])/2;
            const cLz = (bLower.min[2] + bLower.max[2])/2;
            const cUx = (bUpper.min[0] + bUpper.max[0])/2;
            const cUz = (bUpper.min[2] + bUpper.max[2])/2;
            
            const avgX = (cLx + cUx) / 2;
            const avgZ = (cLz + cUz) / 2;
            
            // Bridge width
            const bridgeWidth = 1.8; 
            
            try {
                // Vertical Cylinder Bridge
                // Manifold.cylinder is along Z. Rotate to Y.
                let connector = m.Manifold.cylinder(height, bridgeWidth/2, bridgeWidth/2, 8, true);
                connector = connector.rotate([-90, 0, 0]);
                connector = connector.translate([avgX, centerY, avgZ]);
                bridgeGeoms.push(connector);
            } catch (e) { console.warn("Auto bridge failed", e); }
        }
    }
    
    // Union original parts + new bridges
    const toUnion = [...parts, ...bridgeGeoms];
    const united = m.Manifold.union(toUnion);
    
    // Cleanup intermediates
    // inputManifold is technically represented by 'parts' now, so we can delete inputManifold
    inputManifold.delete();
    toUnion.forEach(p => { if (p !== united) p.delete(); });
    
    return united;
};
