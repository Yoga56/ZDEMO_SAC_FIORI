"! Sample content: two models (Sales Plan, Opex Plan) with Actual, Budget and Forecast versions, plan data,
"! two data actions, a multi action, a sample story, files and calendar tasks. Run with F9 in ADT; running it
"! again replaces the sample rows (rows you created yourself are left alone).
"! The same shape as sap/app/saclib/src/zsac/lib/provider/mockdata (make_mock_data.py).
CLASS zcl_sac_seed DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_weight,
             name   TYPE string,
             weight TYPE decfloat34,
           END OF ty_weight,
           ty_weights TYPE STANDARD TABLE OF ty_weight WITH DEFAULT KEY.

    METHODS clear_samples.
    METHODS seed_models.
    METHODS seed_sales_facts.
    METHODS seed_opex_facts.
    METHODS seed_objects.
    METHODS noise
      IMPORTING a             TYPE i
                b             TYPE i
      RETURNING VALUE(result) TYPE decfloat34.
ENDCLASS.


CLASS zcl_sac_seed IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.
    clear_samples( ).
    seed_models( ).
    seed_sales_facts( ).
    seed_opex_facts( ).
    seed_objects( ).
    COMMIT WORK.
    out->write( 'SAC sample data written: models SALES_PLAN and OPEX_PLAN, story STORY_SALES.' ).
  ENDMETHOD.


  METHOD noise.
    result = CONV decfloat34( ( ( a * 7919 + b * 104729 ) MOD 1000 ) ) / 1000.
  ENDMETHOD.


  METHOD clear_samples.
    DELETE FROM zsac_fact    WHERE model_id IN ( 'SALES_PLAN', 'OPEX_PLAN' ).
    DELETE FROM zsac_version WHERE model_id IN ( 'SALES_PLAN', 'OPEX_PLAN' ).
    DELETE FROM zsac_dim     WHERE model_id IN ( 'SALES_PLAN', 'OPEX_PLAN' ).
    DELETE FROM zsac_measure WHERE model_id IN ( 'SALES_PLAN', 'OPEX_PLAN' ).
    DELETE FROM zsac_model   WHERE model_id IN ( 'SALES_PLAN', 'OPEX_PLAN' ).
    DELETE FROM zsac_widget  WHERE story_id IN ( 'STORY_SALES' ).
    DELETE FROM zsac_story   WHERE story_id IN ( 'STORY_SALES' ).
    DELETE FROM zsac_dastep  WHERE action_id IN ( 'DA_FORECAST_FROM_ACT', 'DA_ALLOC_OPEX' ).
    DELETE FROM zsac_dataact WHERE action_id IN ( 'DA_FORECAST_FROM_ACT', 'DA_ALLOC_OPEX' ).
    DELETE FROM zsac_mastep  WHERE action_id = 'MA_FORECAST_CYCLE'.
    DELETE FROM zsac_multiact WHERE action_id = 'MA_FORECAST_CYCLE'.
    DELETE FROM zsac_file    WHERE file_id LIKE 'F\_%' ESCAPE '\' AND owner_id = 'SEED'.
    DELETE FROM zsac_caltask WHERE task_id IN ( 'T1', 'T2', 'T3', 'T4' ).
  ENDMETHOD.


  METHOD seed_models.
    GET TIME STAMP FIELD DATA(now).
    DATA models TYPE STANDARD TABLE OF zsac_model WITH DEFAULT KEY.
    DATA dims   TYPE STANDARD TABLE OF zsac_dim WITH DEFAULT KEY.
    DATA meas   TYPE STANDARD TABLE OF zsac_measure WITH DEFAULT KEY.
    DATA vers   TYPE STANDARD TABLE OF zsac_version WITH DEFAULT KEY.

    models = VALUE #(
      ( model_id = 'SALES_PLAN' model_name = 'Sales Plan' description = 'Revenue and cost by region, product and channel'
        currency = 'USD' period_from = '2026-01' period_to = '2026-12'
        planning_enabled = abap_true data_locking = abap_true data_audit = abap_true data_source = 'Sample data (ZCL_SAC_SEED)'
        created_at = now last_changed_at = now local_last_changed_at = now )
      ( model_id = 'OPEX_PLAN' model_name = 'Opex Plan' description = 'Operating expense by department and account'
        currency = 'USD' period_from = '2026-01' period_to = '2026-12'
        planning_enabled = abap_true data_source = 'Sample data (ZCL_SAC_SEED)'
        created_at = now last_changed_at = now local_last_changed_at = now ) ).

    dims = VALUE #(
      ( model_id = 'SALES_PLAN' dim_id = 'REGION' label = 'Region' slot = 1 dim_type = 'GENERIC' attributes = `[]`
        members = `[{"Id":"APAC","Text":"Asia Pacific","Props":{}},{"Id":"EMEA","Text":"Europe, Middle East, Africa","Props":{}},{"Id":"AMER","Text":"Americas","Props":{}},`
               && `{"Id":"LATAM","Text":"Latin America","Props":{}},{"Id":"AMERICAS","Text":"North and South America","Props":{}},`
               && `{"Id":"EASTERN","Text":"Eastern hemisphere","Props":{}},{"Id":"WORLD","Text":"Worldwide","Props":{}}]`
        hierarchies = `[{"Id":"GEO","Label":"Geography","Parents":{"AMERICAS":"WORLD","EASTERN":"WORLD","AMER":"AMERICAS","LATAM":"AMERICAS","EMEA":"EASTERN","APAC":"EASTERN"}}]` )
      ( model_id = 'SALES_PLAN' dim_id = 'PRODUCT' label = 'Product' slot = 2 dim_type = 'GENERIC' attributes = `[]`
        members = `[{"Id":"Cloud ERP","Text":"Cloud ERP","Props":{}},{"Id":"Analytics","Text":"Analytics","Props":{}},{"Id":"Planning","Text":"Planning","Props":{}},`
               && `{"Id":"Services","Text":"Services","Props":{}},{"Id":"Licences","Text":"Licences","Props":{}},`
               && `{"Id":"RECURRING","Text":"Recurring revenue","Props":{}},{"Id":"ONE_OFF","Text":"One-off revenue","Props":{}}]`
        hierarchies = `[{"Id":"FAMILY","Label":"Product family","Parents":{"Cloud ERP":"RECURRING","Analytics":"RECURRING","Planning":"RECURRING","Services":"ONE_OFF","Licences":"ONE_OFF"}}]` )
      ( model_id = 'SALES_PLAN' dim_id = 'CHANNEL' label = 'Channel' slot = 3 dim_type = 'GENERIC' attributes = `[]` hierarchies = `[]`
        members = `[{"Id":"Direct","Text":"Direct","Props":{}},{"Id":"Partner","Text":"Partner","Props":{}}]` )
      ( model_id = 'OPEX_PLAN' dim_id = 'DEPARTMENT' label = 'Department' slot = 1 dim_type = 'ORGANIZATION'
        attributes = `[{"Id":"OWNER","Label":"Owner"},{"Id":"CURRENCY","Label":"Currency"}]`
        members = `[{"Id":"Finance","Text":"Finance","Props":{"OWNER":"CFO","CURRENCY":"USD"}},{"Id":"Sales","Text":"Sales","Props":{"OWNER":"CSO","CURRENCY":"USD"}},`
               && `{"Id":"R&D","Text":"R&D","Props":{"OWNER":"CTO","CURRENCY":"USD"}},{"Id":"Operations","Text":"Operations","Props":{"OWNER":"COO","CURRENCY":"USD"}},`
               && `{"Id":"HR","Text":"HR","Props":{"OWNER":"CHRO","CURRENCY":"USD"}},{"Id":"G_A","Text":"General and administration","Props":{"OWNER":"CFO"}},`
               && `{"Id":"OPS","Text":"Operations and engineering","Props":{"OWNER":"COO"}},{"Id":"COMPANY","Text":"Whole company","Props":{"OWNER":"CEO"}}]`
        hierarchies = `[{"Id":"ORG","Label":"Organization","Parents":{"G_A":"COMPANY","OPS":"COMPANY","Sales":"COMPANY","Finance":"G_A","HR":"G_A","Operations":"OPS","R&D":"OPS"}}]` )
      ( model_id = 'OPEX_PLAN' dim_id = 'ACCOUNT' label = 'Account' slot = 2 dim_type = 'ACCOUNT'
        attributes = `[{"Id":"ACCOUNT_TYPE","Label":"Account type"},{"Id":"UNIT","Label":"Unit"}]`
        members = `[{"Id":"Salaries","Text":"Salaries","Props":{"ACCOUNT_TYPE":"EXP","UNIT":"USD"}},{"Id":"Travel","Text":"Travel","Props":{"ACCOUNT_TYPE":"EXP","UNIT":"USD"}},`
               && `{"Id":"Software","Text":"Software","Props":{"ACCOUNT_TYPE":"EXP","UNIT":"USD"}},{"Id":"Facilities","Text":"Facilities","Props":{"ACCOUNT_TYPE":"EXP","UNIT":"USD"}},`
               && `{"Id":"PEOPLE","Text":"People cost","Props":{"ACCOUNT_TYPE":"EXP"}},{"Id":"OTHER_OPEX","Text":"Other operating cost","Props":{"ACCOUNT_TYPE":"EXP"}},`
               && `{"Id":"OPEX_TOTAL","Text":"Total operating expense","Props":{"ACCOUNT_TYPE":"EXP"}}]`
        hierarchies = `[{"Id":"PNL","Label":"P&L structure","Parents":{"PEOPLE":"OPEX_TOTAL","OTHER_OPEX":"OPEX_TOTAL","Salaries":"PEOPLE","Travel":"OTHER_OPEX","Software":"OTHER_OPEX","Facilities":"OTHER_OPEX"}}]` ) ).

    meas = VALUE #(
      ( model_id = 'SALES_PLAN' measure_id = 'REVENUE' label = 'Revenue' unit = 'USD' aggregation = 'SUM'
        data_type = 'Decimal' unit_type = 'Currency' scale = 1 decimals = 0 )
      ( model_id = 'SALES_PLAN' measure_id = 'COST'    label = 'Cost'    unit = 'USD' aggregation = 'SUM'
        data_type = 'Decimal' unit_type = 'Currency' scale = 1 decimals = 0 )
      ( model_id = 'OPEX_PLAN'  measure_id = 'AMOUNT'  label = 'Amount'  unit = 'USD' aggregation = 'SUM'
        data_type = 'Decimal' unit_type = 'Currency' scale = 1 decimals = 0 ) ).

    LOOP AT models INTO DATA(m).
      APPEND VALUE #( model_id = m-model_id version_id = 'ACT' version_name = 'Actual'      category = 'ACTUAL'   locked = abap_true
                      owner_id = 'SYSTEM' status = 'P' created_at = now last_changed_at = now local_last_changed_at = now ) TO vers.
      APPEND VALUE #( model_id = m-model_id version_id = 'BUD' version_name = 'Budget 2026' category = 'BUDGET'   locked = abap_false
                      owner_id = 'SYSTEM' status = 'P' created_at = now last_changed_at = now local_last_changed_at = now ) TO vers.
      APPEND VALUE #( model_id = m-model_id version_id = 'FCT' version_name = 'Forecast'    category = 'FORECAST' locked = abap_false
                      owner_id = 'SYSTEM' status = 'P' created_at = now last_changed_at = now local_last_changed_at = now ) TO vers.
    ENDLOOP.

    INSERT zsac_model   FROM TABLE @models.
    INSERT zsac_dim     FROM TABLE @dims.
    INSERT zsac_measure FROM TABLE @meas.
    INSERT zsac_version FROM TABLE @vers.
  ENDMETHOD.


  METHOD seed_sales_facts.
    DATA facts TYPE STANDARD TABLE OF zsac_fact WITH DEFAULT KEY.
    DATA(regions)  = VALUE ty_weights( ( name = 'APAC' weight = '1.0' ) ( name = 'EMEA' weight = '1.25' ) ( name = 'AMER' weight = '1.6' ) ( name = 'LATAM' weight = '0.55' ) ).
    DATA(products) = VALUE ty_weights( ( name = 'Cloud ERP' weight = '1.5' ) ( name = 'Analytics' weight = '1.0' ) ( name = 'Planning' weight = '0.8' )
                                       ( name = 'Services' weight = '0.6' ) ( name = 'Licences' weight = '1.2' ) ).
    DATA(channels) = VALUE ty_weights( ( name = 'Direct' weight = '1.1' ) ( name = 'Partner' weight = '0.7' ) ).
    DATA(measures) = VALUE ty_weights( ( name = 'REVENUE' weight = 520 ) ( name = 'COST' weight = 310 ) ).
    DATA(versions) = VALUE string_table( ( `ACT` ) ( `BUD` ) ( `FCT` ) ).
    GET TIME STAMP FIELD DATA(now).

    LOOP AT versions INTO DATA(version).
      DO 12 TIMES.
        DATA(month) = sy-index.
        CHECK version <> 'ACT' OR month <= 9.
        DATA(period) = |2026-{ month WIDTH = 2 ALIGN = RIGHT PAD = '0' }|.
        DATA(season) = CONV decfloat34( 1 + ( CONV decfloat34( month - 1 ) * '0.05' ) ).
        IF month MOD 3 = 0.
          season = season + '0.12'.
        ENDIF.
        LOOP AT regions INTO DATA(r).
          LOOP AT products INTO DATA(p).
            LOOP AT channels INTO DATA(c).
              LOOP AT measures INTO DATA(ms).
                DATA(amount) = ms-weight * r-weight * p-weight * c-weight * season.
                DATA(n) = noise( a = month + sy-tabix b = strlen( r-name ) * 31 + strlen( p-name ) * 17 + strlen( version ) ).
                IF version = 'ACT'.
                  amount = amount * ( '0.9' + '0.2' * n ).
                ELSEIF version = 'FCT'.
                  amount = amount * ( '0.95' + '0.12' * n ).
                ENDIF.
                APPEND VALUE #( model_id = 'SALES_PLAN' version_id = version period = period measure = ms-name
                                dim1 = r-name dim2 = p-name dim3 = c-name
                                fact_value = round( val = amount dec = 2 ) local_last_changed_at = now ) TO facts.
              ENDLOOP.
            ENDLOOP.
          ENDLOOP.
        ENDLOOP.
      ENDDO.
    ENDLOOP.
    INSERT zsac_fact FROM TABLE @facts.
  ENDMETHOD.


  METHOD seed_opex_facts.
    DATA facts TYPE STANDARD TABLE OF zsac_fact WITH DEFAULT KEY.
    DATA(departments) = VALUE ty_weights( ( name = 'Finance' weight = '0.8' ) ( name = 'Sales' weight = '1.4' ) ( name = 'R&D' weight = '1.8' )
                                          ( name = 'Operations' weight = '1.2' ) ( name = 'HR' weight = '0.6' ) ).
    DATA(accounts) = VALUE ty_weights( ( name = 'Salaries' weight = '3.0' ) ( name = 'Travel' weight = '0.5' ) ( name = 'Software' weight = '0.9' )
                                       ( name = 'Facilities' weight = '1.0' ) ).
    DATA(versions) = VALUE string_table( ( `ACT` ) ( `BUD` ) ( `FCT` ) ).
    GET TIME STAMP FIELD DATA(now).

    LOOP AT versions INTO DATA(version).
      DO 12 TIMES.
        DATA(month) = sy-index.
        CHECK version <> 'ACT' OR month <= 9.
        DATA(period) = |2026-{ month WIDTH = 2 ALIGN = RIGHT PAD = '0' }|.
        LOOP AT departments INTO DATA(d).
          LOOP AT accounts INTO DATA(a).
            DATA(amount) = 100 * d-weight * a-weight * ( 1 + CONV decfloat34( month - 1 ) / 100 ).
            DATA(n) = noise( a = month b = strlen( d-name ) * 13 + strlen( a-name ) ).
            IF version = 'ACT'.
              amount = amount * ( '0.92' + '0.18' * n ).
            ELSEIF version = 'FCT'.
              amount = amount * ( '0.97' + '0.08' * n ).
            ENDIF.
            APPEND VALUE #( model_id = 'OPEX_PLAN' version_id = version period = period measure = 'AMOUNT'
                            dim1 = d-name dim2 = a-name fact_value = round( val = amount dec = 2 ) local_last_changed_at = now ) TO facts.
          ENDLOOP.
        ENDLOOP.
      ENDDO.
    ENDLOOP.
    INSERT zsac_fact FROM TABLE @facts.
  ENDMETHOD.


  METHOD seed_objects.
    GET TIME STAMP FIELD DATA(now).
    DATA(ytd) = `["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08","2026-09"]`.

    INSERT zsac_story FROM TABLE @( VALUE #( ( story_id = 'STORY_SALES' story_name = 'Sales Performance'
      description = 'Actual vs budget revenue, year to date' model_id = 'SALES_PLAN' status = 'P'
      pages = `[{"Id":1,"Title":"Overview"}]` filters = `{}`
      created_at = now last_changed_at = now local_last_changed_at = now ) ) ).

    INSERT zsac_widget FROM TABLE @( VALUE #(
      ( story_id = 'STORY_SALES' widget_id = 'W1' page_no = 1 widget_type = 'kpi' title = 'Revenue (Actual)' grid_x = 0 grid_y = 0 grid_w = 3 grid_h = 2
        binding = `{"ModelId":"SALES_PLAN","Rows":[],"Columns":[],"Measure":"REVENUE","Filters":{"VERSION":["ACT"],"PERIOD":` && ytd && `}}`
        props = `{"CompareVersion":"BUD","Format":"compact"}` local_last_changed_at = now )
      ( story_id = 'STORY_SALES' widget_id = 'W2' page_no = 1 widget_type = 'chart.bar' title = 'Revenue by region, actual vs budget' grid_x = 0 grid_y = 2 grid_w = 6 grid_h = 4
        binding = `{"ModelId":"SALES_PLAN","Rows":["REGION"],"Columns":["VERSION"],"Measure":"REVENUE","Filters":{"VERSION":["ACT","BUD"],"PERIOD":` && ytd && `}}`
        props = `{}` local_last_changed_at = now )
      ( story_id = 'STORY_SALES' widget_id = 'W3' page_no = 1 widget_type = 'chart.line' title = 'Revenue trend' grid_x = 6 grid_y = 2 grid_w = 6 grid_h = 4
        binding = `{"ModelId":"SALES_PLAN","Rows":["PERIOD"],"Columns":["VERSION"],"Measure":"REVENUE","Filters":{"VERSION":["ACT","BUD","FCT"]}}`
        props = `{}` local_last_changed_at = now )
      ( story_id = 'STORY_SALES' widget_id = 'W4' page_no = 1 widget_type = 'table' title = 'Revenue by region and product' grid_x = 0 grid_y = 6 grid_w = 12 grid_h = 5
        binding = `{"ModelId":"SALES_PLAN","Rows":["REGION","PRODUCT"],"Columns":["VERSION"],"Measure":"REVENUE","Filters":{"VERSION":["ACT","BUD"]}}`
        props = `{"ShowTotals":true,"Decimals":0}` local_last_changed_at = now ) ) ).

    INSERT zsac_dataact FROM TABLE @( VALUE #(
      ( action_id = 'DA_FORECAST_FROM_ACT' model_id = 'SALES_PLAN' action_name = 'Forecast Q4 from run-rate'
        description = 'Copy actuals to the forecast and uplift 5%' created_at = now last_changed_at = now local_last_changed_at = now )
      ( action_id = 'DA_ALLOC_OPEX' model_id = 'OPEX_PLAN' action_name = 'Allocate HR budget to departments'
        description = 'Spread HR budget equally over three departments' created_at = now last_changed_at = now local_last_changed_at = now ) ) ).

    INSERT zsac_dastep FROM TABLE @( VALUE #(
      ( action_id = 'DA_FORECAST_FROM_ACT' step_no = 10 step_type = 'COPY'  src_version = 'ACT' tgt_version = 'FCT' factor = 1 local_last_changed_at = now )
      ( action_id = 'DA_FORECAST_FROM_ACT' step_no = 20 step_type = 'SCALE' tgt_version = 'FCT' factor = '1.05'
        filter_text = 'PERIOD=2026-07,2026-08,2026-09' local_last_changed_at = now )
      ( action_id = 'DA_ALLOC_OPEX' step_no = 10 step_type = 'ALLOCATE' src_version = 'BUD' tgt_version = 'FCT' factor = 1
        filter_text = 'DEPARTMENT=HR' target_dim = 'DEPARTMENT' target_members = 'Finance,Sales,Operations' local_last_changed_at = now ) ) ).

    INSERT zsac_multiact FROM TABLE @( VALUE #(
      ( action_id = 'MA_FORECAST_CYCLE' action_name = 'Forecast cycle'
        description = 'Run the forecast action, then publish the forecast to the budget'
        created_at = now last_changed_at = now local_last_changed_at = now ) ) ).
    INSERT zsac_mastep FROM TABLE @( VALUE #(
      ( action_id = 'MA_FORECAST_CYCLE' step_no = 10 step_type = 'DATAACTION' data_action_id = 'DA_FORECAST_FROM_ACT' local_last_changed_at = now )
      ( action_id = 'MA_FORECAST_CYCLE' step_no = 20 step_type = 'PUBLISH' model_id = 'SALES_PLAN' source_version = 'FCT' target_version = 'BUD'
        local_last_changed_at = now ) ) ).

    INSERT zsac_file FROM TABLE @( VALUE #(
      ( file_id = 'F_FOLDER_FIN' file_type = 'FOLDER' file_name = 'Finance' description = 'Finance content' owner_id = 'SEED' created_at = now last_changed_at = now local_last_changed_at = now )
      ( file_id = 'F_STORY_STORY_SALES' parent_id = 'F_FOLDER_FIN' file_type = 'STORY' object_id = 'STORY_SALES' file_name = 'Sales Performance'
        description = 'Actual vs budget revenue' owner_id = 'SEED' favourite = abap_true shared = abap_true created_at = now last_changed_at = now local_last_changed_at = now )
      ( file_id = 'F_MODEL_SALES_PLAN' file_type = 'MODEL' object_id = 'SALES_PLAN' file_name = 'Sales Plan' description = 'Revenue and cost by region, product and channel'
        owner_id = 'SEED' favourite = abap_true created_at = now last_changed_at = now local_last_changed_at = now )
      ( file_id = 'F_MODEL_OPEX_PLAN' file_type = 'MODEL' object_id = 'OPEX_PLAN' file_name = 'Opex Plan' description = 'Operating expense by department and account'
        owner_id = 'SEED' created_at = now last_changed_at = now local_last_changed_at = now )
      ( file_id = 'F_DATAACTION_DA_FORECAST_FROM_ACT' file_type = 'DATAACTION' object_id = 'DA_FORECAST_FROM_ACT' file_name = 'Forecast Q4 from run-rate'
        owner_id = 'SEED' created_at = now last_changed_at = now local_last_changed_at = now )
      ( file_id = 'F_MULTIACTION_MA_FORECAST_CYCLE' file_type = 'MULTIACTION' object_id = 'MA_FORECAST_CYCLE' file_name = 'Forecast cycle'
        owner_id = 'SEED' created_at = now last_changed_at = now local_last_changed_at = now ) ) ).

    INSERT zsac_caltask FROM TABLE @( VALUE #(
      ( task_id = 'T1' title = 'Submit Q4 forecast' model_id = 'SALES_PLAN' version_id = 'FCT' assignee = 'ME' due_date = '20261015' status = 'OPEN' approver = 'CFO'
        notes = 'Regional leads submit by Oct 12' created_at = now last_changed_at = now local_last_changed_at = now )
      ( task_id = 'T2' title = 'Review budget 2027 assumptions' model_id = 'SALES_PLAN' version_id = 'BUD' assignee = 'ME' due_date = '20261031' status = 'OPEN' approver = 'CFO'
        created_at = now last_changed_at = now local_last_changed_at = now )
      ( task_id = 'T3' title = 'Approve opex forecast' model_id = 'OPEX_PLAN' version_id = 'FCT' assignee = 'CFO' due_date = '20261020' status = 'IN_REVIEW' approver = 'CFO'
        notes = 'Waiting for R&D' created_at = now last_changed_at = now local_last_changed_at = now )
      ( task_id = 'T4' title = 'Close September actuals' model_id = 'SALES_PLAN' version_id = 'ACT' assignee = 'ME' due_date = '20261005' status = 'DONE'
        created_at = now last_changed_at = now local_last_changed_at = now ) ) ).
  ENDMETHOD.

ENDCLASS.
