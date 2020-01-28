import merge from 'lodash/merge';
// import { initial } from 'lodash';
import translations from '../assets/translations';
import union from '@turf/union';
import { featureCollection, dissolve, polygon } from '@turf/turf';


const Map = L.Class.extend({
  initialize(map) {
    this.map = map;
    this.Draw = new L.PM.Draw(map);
    this.Toolbar = new L.PM.Toolbar(map);

    this._globalRemovalMode = false;
    this._globalSelectionMode = false;
  },
  setLang(lang = 'en', t, fallback = 'en') {
    if (t) {
      translations[lang] = merge(translations[fallback], t);
    }

    L.PM.activeLang = lang;
    this.map.pm.Toolbar.reinit();
  },
  addControls(options) {
    this.Toolbar.addControls(options);
  },
  removeControls() {
    this.Toolbar.removeControls();
  },
  toggleControls() {
    this.Toolbar.toggleControls();
  },
  controlsVisible() {
    return this.Toolbar.isVisible;
  },
  enableDraw(shape = 'Polygon', options) {
    // backwards compatible, remove after 3.0
    if (shape === 'Poly') {
      shape = 'Polygon';
    }

    this.Draw.enable(shape, options);
  },
  disableDraw(shape = 'Polygon') {
    // backwards compatible, remove after 3.0
    if (shape === 'Poly') {
      shape = 'Polygon';
    }

    this.Draw.disable(shape);
  },
  setPathOptions(options) {
    this.Draw.setPathOptions(options);
  },
  findLayers() {
    let layers = [];
    this.map.eachLayer(layer => {
      if (
        layer instanceof L.Polyline ||
        layer instanceof L.Marker ||
        layer instanceof L.Circle ||
        layer instanceof L.CircleMarker
      ) {
        layers.push(layer);
      }
    });

    // filter out layers that don't have the leaflet-geoman instance
    layers = layers.filter(layer => !!layer.pm);

    // filter out everything that's leaflet-geoman specific temporary stuff
    layers = layers.filter(layer => !layer._pmTempLayer);

    return layers;
  },
  removeLayer(e) {

    const layer = e.target;
    // only remove layer, if it's handled by leaflet-geoman,
    // not a tempLayer and not currently being dragged
    const removeable =
      !layer._pmTempLayer && (!layer.pm || !layer.pm.dragging());

    if (removeable) {
      layer.remove();
      this.map.fire('pm:remove', { layer });
    }
  },
  globalDragModeEnabled() {
    return !!this._globalDragMode;
  },
  enableGlobalDragMode() {
    const layers = this.findLayers();

    this._globalDragMode = true;

    layers.forEach(layer => {
      layer.pm.enableLayerDrag();
    });

    // remove map handler
    this.map.on('layeradd', this.layerAddHandler, this);

    // toogle the button in the toolbar if this is called programatically
    this.Toolbar.toggleButton('dragMode', this._globalDragMode);

    this._fireDragModeEvent(true);
  },
  disableGlobalDragMode() {
    const layers = this.findLayers();

    this._globalDragMode = false;

    layers.forEach(layer => {
      layer.pm.disableLayerDrag();
    });

    // remove map handler
    this.map.off('layeradd', this.layerAddHandler, this);

    // toogle the button in the toolbar if this is called programatically
    this.Toolbar.toggleButton('dragMode', this._globalDragMode);

    this._fireDragModeEvent(false);
  },
  _fireDragModeEvent(enabled) {
    this.map.fire('pm:globaldragmodetoggled', {
      enabled,
      map: this.map,
    });
  },
  toggleGlobalDragMode() {
    if (this.globalDragModeEnabled()) {
      this.disableGlobalDragMode();
    } else {
      this.enableGlobalDragMode();
    }
  },
  layerAddHandler({ layer }) {
    // is this layer handled by leaflet-geoman?
    const isRelevant = !!layer.pm && !layer._pmTempLayer;

    // do nothing if layer is not handled by leaflet so it doesn't fire unnecessarily
    if (!isRelevant) {
      return;
    }

    // re-enable global removal mode if it's enabled already
    if (this.globalRemovalEnabled()) {
      this.disableGlobalRemovalMode();
      this.enableGlobalRemovalMode();
    }

    // re-enable global edit mode if it's enabled already
    if (this.globalEditEnabled()) {
      this.disableGlobalEditMode();
      this.enableGlobalEditMode();
    }

    // re-enable global drag mode if it's enabled already
    if (this.globalDragModeEnabled()) {
      this.disableGlobalDragMode();
      this.enableGlobalDragMode();
    }
  },
  disableGlobalRemovalMode() {
    this._globalRemovalMode = false;
    this.map.eachLayer(layer => {
      layer.off('click', this.removeLayer, this);
    });

    // remove map handler
    this.map.off('layeradd', this.layerAddHandler, this);

    // toogle the button in the toolbar if this is called programatically
    this.Toolbar.toggleButton('deleteLayer', this._globalRemovalMode);

    this._fireRemovalModeEvent(false);
  },
  enableGlobalRemovalMode() {
    const isRelevant = layer =>
      layer.pm &&
      !(layer.pm.options && layer.pm.options.preventMarkerRemoval) &&
      !(layer instanceof L.LayerGroup);

    this._globalRemovalMode = true;
    // handle existing layers
    this.map.eachLayer(layer => {
      if (isRelevant(layer)) {
        layer.on('click', this.removeLayer, this);
      }
    });

    // handle layers that are added while in removal  xmode
    this.map.on('layeradd', this.layerAddHandler, this);

    // toogle the button in the toolbar if this is called programatically
    this.Toolbar.toggleButton('deleteLayer', this._globalRemovalMode);

    this._fireRemovalModeEvent(true);
  },
  _fireRemovalModeEvent(enabled) {
    this.map.fire('pm:globalremovalmodetoggled', {
        enabled,
        map: this.map,
      });
  },
  toggleGlobalRemovalMode() {
    // toggle global edit mode
    if (this.globalRemovalEnabled()) {
      this.disableGlobalRemovalMode();
    } else {
      this.enableGlobalRemovalMode();
    }
  },
  globalRemovalEnabled() {
    return !!this._globalRemovalMode;
  },
  globalEditEnabled() {
    return this._globalEditMode;
  },
  enableGlobalEditMode(options) {
    // find all layers handled by leaflet-geoman
    const layers = this.findLayers();

    this._globalEditMode = true;

    layers.forEach(layer => {
      // console.log(layer);
      layer.pm.enable(options);
    });

    layers.forEach(layer => {
      layer.pm.associateCommonMarkersFromOtherLayers();
    });

    // handle layers that are added while in removal  xmode
    this.map.on('layeradd', this.layerAddHandler, this);

    // toggle the button in the toolbar
    this.Toolbar.toggleButton('editPolygon', this._globalEditMode);

    // fire event
    this._fireEditModeEvent(true);
  },
  disableGlobalEditMode() {
    // find all layers handles by leaflet-geoman
    const layers = this.findLayers();

    this._globalEditMode = false;

    layers.forEach(layer => {
      layer.pm.disable();
    });

    // handle layers that are added while in removal  xmode
    this.map.on('layeroff', this.layerAddHandler, this);

    // toggle the button in the toolbar
    this.Toolbar.toggleButton('editPolygon', this._globalEditMode);

    // fire event
    this._fireEditModeEvent(false);
  },
  _fireEditModeEvent(enabled) {
    this.map.fire('pm:globaleditmodetoggled', {
      enabled,
      map: this.map,
    });
  },
  toggleGlobalEditMode(options) {
    // console.log('toggle global edit mode', options);
    if (this.globalEditEnabled()) {
      // disable
      this.disableGlobalEditMode();
    } else {
      // enable
      this.enableGlobalEditMode(options);
    }
  },
  toggleGlobalSelectionMode() {
    if (!this._globalSelectionMode) {
      this._globalSelectionMode = true;
      this.findLayers().forEach(layer => {
        if (!layer.originalColor) {
          // Difference between the way L.polygon and react-leaflet.GeoJSON seem to handle
          // their color property (not sure about it for now)
          if (layer.color) {
            layer.originalColor = layer.color;
          } else if (layer.options.style) {
            layer.originalColor = layer.options.style.color;
          }
        }
        layer.on('click', e => {
          layer.setStyle({
            color: layer._selected ? layer.originalColor : 'blue'
          });
          layer._selected = !layer._selected;
        });
      });
    } else {
      this._globalSelectionMode = false;
      this.findLayers().forEach(layer => {
        layer._selected = false;
        if (layer.originalColor) {
          layer.setStyle({
            color: layer.originalColor
          });
        }
        layer.off('click');
      });
    }
  },

  mergeSelectedPolygons() {
    let layers = [];
    this.findLayers().forEach(layer => {
      if (layer._selected) {
        layers.push(layer);
      }
    });

    if (layers.length < 1) {
      alert('You must select the polygons to merge!');
      return;
    }

    let features = featureCollection(layers.map(l => polygon(l.toGeoJSON(15).geometry.coordinates)));
    let dissolved = dissolve(features);

    if (dissolved.features.length !== 1) {
      alert('Merged polygons must be contiguous!');
      return;
    }

    layers.forEach(layer => layer.remove());

    let coords = dissolved.features[0].geometry.coordinates[0].map(([x, y]) => [y, x]);
    let polyColor = layers[0].originalColor;
    let poly = L.polygon(coords, {color: polyColor});
    poly.addTo(this.map);

    // Since we didn't leave the selection mode, make the new poly selectable right away (not sure about this)
    poly.originalColor = polyColor;
    poly.on('click', e => {
      poly.setStyle({
        color: poly._selected ? poly.originalColor : 'blue'
      });
      poly._selected = !poly._selected;
    });

  },

});

export default Map;
