"! Filter text of the data action steps and parameters: "REGION=APAC,EMEA;PERIOD=2026-01,2026-02".
"! Dimension ids are mapped to the fact columns through the model (DIM1..DIM5); VERSION, PERIOD and MEASURE are built in.
CLASS zcl_sac_filter DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_dim,
             field   TYPE string,
             members TYPE string_table,
           END OF ty_dim,
           ty_filter TYPE STANDARD TABLE OF ty_dim WITH DEFAULT KEY.

    CLASS-METHODS parse
      IMPORTING model_id      TYPE zsac_dim-model_id
                text          TYPE string
      RETURNING VALUE(result) TYPE ty_filter.

    "! A dimension in both filters keeps only the members common to both
    CLASS-METHODS merge
      IMPORTING first         TYPE ty_filter
                second        TYPE ty_filter
      RETURNING VALUE(result) TYPE ty_filter.

    CLASS-METHODS matches
      IMPORTING fact          TYPE any
                filter        TYPE ty_filter
      RETURNING VALUE(result) TYPE abap_bool.
ENDCLASS.


CLASS zcl_sac_filter IMPLEMENTATION.

  METHOD parse.
    DATA parts TYPE string_table.
    SPLIT text AT ';' INTO TABLE parts.
    LOOP AT parts INTO DATA(part).
      SPLIT part AT '=' INTO DATA(dim) DATA(list).
      CONDENSE dim.
      CHECK dim IS NOT INITIAL AND list IS NOT INITIAL.
      DATA(field) = SWITCH string( to_upper( dim )
                      WHEN 'VERSION' THEN `VERSION_ID`
                      WHEN 'PERIOD'  THEN `PERIOD`
                      WHEN 'MEASURE' THEN `MEASURE`
                      ELSE `` ).
      IF field IS INITIAL.
        DATA(dim_id) = CONV zsac_dim-dim_id( dim ).
        SELECT SINGLE slot FROM zsac_dim WHERE model_id = @model_id AND dim_id = @dim_id INTO @DATA(slot).
        CHECK sy-subrc = 0.
        field = |DIM{ slot }|.
      ENDIF.
      APPEND VALUE #( field = field ) TO result ASSIGNING FIELD-SYMBOL(<dim>).
      SPLIT list AT ',' INTO TABLE <dim>-members.
    ENDLOOP.
  ENDMETHOD.


  METHOD merge.
    result = first.
    LOOP AT second INTO DATA(other).
      ASSIGN result[ field = other-field ] TO FIELD-SYMBOL(<own>).
      IF sy-subrc = 0.
        DELETE <own>-members WHERE table_line NOT IN other-members.
      ELSE.
        APPEND other TO result.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD matches.
    result = abap_true.
    LOOP AT filter INTO DATA(dim).
      ASSIGN COMPONENT dim-field OF STRUCTURE fact TO FIELD-SYMBOL(<value>).
      CHECK sy-subrc = 0.
      DATA(wanted) = CONV string( <value> ).
      IF NOT line_exists( dim-members[ table_line = wanted ] ).
        result = abap_false.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
